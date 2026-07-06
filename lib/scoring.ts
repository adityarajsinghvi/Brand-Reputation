import type { Review, SourceUrlResult, ComplaintTheme } from './types';
import { geminiGenerateJson, hasGeminiKey } from './gemini';

export function computeSentimentSplit(reviews: Review[]) {
  const total = reviews.length || 1;
  const pos = reviews.filter((r) => r.sentiment === 'pos').length;
  const neg = reviews.filter((r) => r.sentiment === 'neg').length;
  const neu = total - pos - neg;
  return {
    pos: Math.round((pos / total) * 100),
    neu: Math.round((neu / total) * 100),
    neg: Math.round((neg / total) * 100),
  };
}

function ruleBasedVerdict(brandName: string, score: number, topComplaint?: ComplaintTheme): [string, string] {
  const riskNote = topComplaint ? `, with "${topComplaint.theme}" as the most recurring complaint` : '';
  if (score >= 78) return ['Strong, trending positive', `${brandName} shows healthy sentiment across the sources analyzed${riskNote}.`];
  if (score >= 55) return ['Solid, with pockets of risk', `${brandName} is broadly stable${riskNote}.`];
  return ['Mixed, real risk to reputation', `${brandName}'s reputation is fragile${riskNote}.`];
}

export async function computeScoreAndVerdict(opts: {
  brandName: string;
  reviews: Review[];
  sources: SourceUrlResult[];
  themes: ComplaintTheme[];
}): Promise<{ score: number; verdictTitle: string; verdictText: string }> {
  const { brandName, reviews, sources, themes } = opts;
  const sentiment = computeSentimentSplit(reviews);

  const ratedReviews = reviews.filter((r) => typeof r.rating === 'number');
  const avgRating = ratedReviews.length
    ? ratedReviews.reduce((sum, r) => sum + (r.rating as number), 0) / ratedReviews.length
    : null;

  const sentimentScore = sentiment.pos - sentiment.neg + 50;
  const ratingScore = avgRating !== null ? (avgRating / 5) * 100 : sentimentScore;
  const complaintCount = themes.filter((t) => t.kind === 'complaint').reduce((s, t) => s + t.count, 0);
  const praiseCount = themes.filter((t) => t.kind === 'praise').reduce((s, t) => s + t.count, 0);
  const balanceScore = complaintCount + praiseCount > 0 ? (praiseCount / (complaintCount + praiseCount)) * 100 : 50;

  const raw = sentimentScore * 0.45 + ratingScore * 0.35 + balanceScore * 0.2;
  const score = Math.max(3, Math.min(97, Math.round(raw)));

  const liveCount = sources.filter((s) => s.status === 'scraped').length;
  const topComplaint = [...themes].filter((t) => t.kind === 'complaint').sort((a, b) => b.count - a.count)[0];

  let verdictTitle: string;
  let verdictText: string;

  if (hasGeminiKey()) {
    const geminiResult = await geminiGenerateJson<{ title: string; text: string }>({
      systemInstruction:
        'Given aggregated brand reputation signals across multiple review platforms, write a short verdict for a business-development pitch. Return JSON: {"title": string (max 6 words, e.g. "Strong, trending positive"), "text": string (max 25 words, one sentence, name the single biggest risk area if any)}',
      prompt: `Brand: ${brandName}\nComposite score: ${score}/100\nSentiment split: ${sentiment.pos}% positive, ${sentiment.neu}% neutral, ${sentiment.neg}% negative\nAverage numeric rating where available: ${avgRating?.toFixed(1) ?? 'n/a'}\nTop complaint theme: ${topComplaint ? `${topComplaint.theme} (${topComplaint.count} mentions)` : 'none notable'}\nSources analyzed live vs total: ${liveCount}/${sources.length}`,
    });
    if (geminiResult) {
      verdictTitle = geminiResult.title;
      verdictText = geminiResult.text;
    } else {
      [verdictTitle, verdictText] = ruleBasedVerdict(brandName, score, topComplaint);
    }
  } else {
    [verdictTitle, verdictText] = ruleBasedVerdict(brandName, score, topComplaint);
  }

  return { score, verdictTitle, verdictText };
}
