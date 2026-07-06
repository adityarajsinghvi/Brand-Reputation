import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { scrapeUrl, isSupportedPlatform } from '@/lib/scrapers';
import { classifySentiments, type TaggedReview } from '@/lib/sentiment';
import { extractThemes } from '@/lib/themes';
import { computeScoreAndVerdict, computeSentimentSplit } from '@/lib/scoring';
import type { BrandReport, ComplaintTheme, Platform, Review, SourceUrlResult, UrlInput } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_URLS_TOTAL = 15;
const MAX_URLS_PER_PLATFORM = 3;

export async function POST(request: NextRequest) {
  let body: { brandName?: string; brandUrl?: string; urls?: UrlInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const brandName = (body.brandName ?? '').trim();
  if (!brandName) {
    return NextResponse.json({ error: 'brandName is required' }, { status: 400 });
  }
  const brandUrl = body.brandUrl?.trim() || null;

  const rawUrls = Array.isArray(body.urls) ? body.urls : [];
  const seen = new Set<string>();
  const perPlatformCount: Record<string, number> = {};
  const urls: UrlInput[] = [];
  for (const entry of rawUrls) {
    if (!entry?.url || !entry?.platform) continue;
    if (!isSupportedPlatform(entry.platform)) continue;
    if (seen.has(entry.url)) continue;
    const countSoFar = perPlatformCount[entry.platform] ?? 0;
    if (countSoFar >= MAX_URLS_PER_PLATFORM) continue;
    if (urls.length >= MAX_URLS_TOTAL) break;
    perPlatformCount[entry.platform] = countSoFar + 1;
    seen.add(entry.url);
    urls.push({ platform: entry.platform, url: entry.url });
  }

  if (urls.length === 0) {
    return NextResponse.json({ error: 'At least one valid platform URL is required' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const outcomes = await Promise.allSettled(urls.map((u) => scrapeUrl(u.platform, u.url)));

  const sources: SourceUrlResult[] = [];
  const taggedReviews: TaggedReview[] = [];

  outcomes.forEach((outcome, idx) => {
    const { platform, url } = urls[idx];
    const scraped = outcome.status === 'fulfilled' ? outcome.value : null;
    const reviewsRaw = scraped?.status === 'scraped' ? scraped.reviews : [];
    const reason = scraped?.reason ?? (outcome.status === 'rejected' ? String(outcome.reason) : undefined);

    // A source is either genuinely scraped or failed — we never substitute
    // fabricated reviews. Failed sources contribute zero reviews to the corpus
    // and are surfaced with their reason so the report is never misleading.
    const status: SourceUrlResult['status'] = reviewsRaw.length > 0 ? 'scraped' : 'failed';

    const ratings = reviewsRaw.map((r) => r.rating).filter((r): r is number => typeof r === 'number');
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    sources.push({ platform, url, status, reviewsExtracted: reviewsRaw.length, avgRating, reason });
    reviewsRaw.forEach((r) => taggedReviews.push({ ...r, platform, sourceUrl: url }));
  });

  const reviews = await classifySentiments(taggedReviews);

  let score: number | null;
  let verdictTitle: string;
  let verdictText: string;
  let themes: ComplaintTheme[] = [];

  if (reviews.length === 0) {
    // Nothing was scraped — report this honestly instead of inventing a score.
    score = null;
    verdictTitle = 'No reviews could be extracted';
    verdictText =
      'None of the provided URLs returned reviews — check each source below for the reason (blocked, wrong page type, or no reviews present) and try again with working review URLs.';
  } else {
    themes = await extractThemes(reviews);
    const scored = await computeScoreAndVerdict({ brandName, reviews, sources, themes });
    score = scored.score;
    verdictTitle = scored.verdictTitle;
    verdictText = scored.verdictText;
  }

  const sentiment = computeSentimentSplit(reviews);
  const platformBreakdown = buildPlatformBreakdown(reviews);

  const { data: reportRow, error: reportErr } = await supabase
    .from('brand_reports')
    .insert({
      brand_name: brandName,
      brand_url: brandUrl,
      reputation_score: score,
      verdict_title: verdictTitle,
      verdict_summary: verdictText,
    })
    .select()
    .single();

  if (reportErr || !reportRow) {
    console.error('Failed to persist brand_reports row', reportErr);
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }

  const { data: sourceRows, error: sourceErr } = await supabase
    .from('source_urls')
    .insert(
      sources.map((s) => ({
        report_id: reportRow.id,
        platform: s.platform,
        url: s.url,
        status: s.status,
        reviews_extracted: s.reviewsExtracted,
        avg_rating: s.avgRating,
        reason: s.reason ?? null,
      }))
    )
    .select();

  if (sourceErr) {
    console.error('Failed to persist source_urls', sourceErr);
  }

  const sourceIdByUrl = new Map((sourceRows ?? []).map((row: { url: string; id: string }) => [row.url, row.id]));

  const { error: reviewsErr } = await supabase.from('reviews').insert(
    reviews.map((r) => ({
      report_id: reportRow.id,
      source_url_id: sourceIdByUrl.get(r.sourceUrl) ?? null,
      platform: r.platform,
      author: r.author ?? null,
      rating: r.rating ?? null,
      text: r.text,
      sentiment: r.sentiment,
      review_date: r.date ?? null,
      source_url: r.sourceUrl,
    }))
  );
  if (reviewsErr) console.error('Failed to persist reviews', reviewsErr);

  if (themes.length > 0) {
    const { error: themesErr } = await supabase.from('complaint_themes').insert(
      themes.map((t) => ({
        report_id: reportRow.id,
        kind: t.kind,
        theme: t.theme,
        count: t.count,
        example_snippet: t.example_snippet,
      }))
    );
    if (themesErr) console.error('Failed to persist complaint_themes', themesErr);
  }

  const report: BrandReport = {
    id: reportRow.id,
    brandName,
    brandUrl,
    generatedAt: reportRow.created_at,
    score,
    verdictTitle,
    verdictText,
    sources,
    sentiment,
    platformBreakdown,
    themes,
    reviews,
    fromCache: false,
  };

  return NextResponse.json(report);
}

function buildPlatformBreakdown(reviews: Review[]): BrandReport['platformBreakdown'] {
  const byPlatform = new Map<Platform, Review[]>();
  for (const r of reviews) {
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, []);
    byPlatform.get(r.platform)!.push(r);
  }
  return Array.from(byPlatform.entries()).map(([platform, rs]) => {
    const split = computeSentimentSplit(rs);
    const ratings = rs.map((r) => r.rating).filter((r): r is number => typeof r === 'number');
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    return { platform, reviewCount: rs.length, avgRating, ...split };
  });
}
