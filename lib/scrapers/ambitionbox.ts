import * as cheerio from 'cheerio';
import type { RawReview } from '../types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// AmbitionBox is a Next.js app that server-renders its review cards into the
// initial HTML, but its client hydration hangs headless Chromium (browser
// scrape times out). A plain fetch returns the fully-rendered cards, which we
// parse with cheerio. Each card exposes data-testid="ReviewCard_<id>_Likes"
// / "_Dislikes" text blocks and a border-rating-<N> class on its header.
export async function scrapeAmbitionBox(url: string): Promise<RawReview[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`AmbitionBox returned ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const reviews: RawReview[] = [];
  const seenIds = new Set<string>();

  $('[data-testid^="ReviewCard_"][data-testid$="_Header"]').each((_, header) => {
    const testId = $(header).attr('data-testid') ?? '';
    const idMatch = testId.match(/ReviewCard_(\d+)_Header/);
    if (!idMatch) return;
    const id = idMatch[1];
    if (seenIds.has(id)) return;
    seenIds.add(id);

    // Rating comes from a border-rating-<N> utility class on the header (or an ancestor/descendant).
    const classAttr =
      ($(header).attr('class') ?? '') +
      ' ' +
      ($(header).find('[class*="border-rating-"]').attr('class') ?? '') +
      ' ' +
      ($(header).closest('[class*="border-rating-"]').attr('class') ?? '');
    const ratingMatch = classAttr.match(/border-rating-(\d)/);
    const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;

    // The _Likes / _Dislikes testids sit on the label element ("Likes" /
    // "Dislikes"); the actual pros/cons text is the immediately following
    // sibling node.
    const clean = (t: string) => t.replace(/\s*Read (more|less)\s*$/i, '').trim();
    const likes = clean($(`[data-testid="ReviewCard_${id}_Likes"]`).next().text().trim());
    const dislikes = clean($(`[data-testid="ReviewCard_${id}_Dislikes"]`).next().text().trim());

    const parts: string[] = [];
    if (likes) parts.push(`Likes: ${likes}`);
    if (dislikes) parts.push(`Dislikes: ${dislikes}`);
    const text = parts.join(' | ');
    if (text) reviews.push({ author: null, rating, text, date: null });
  });

  return reviews;
}
