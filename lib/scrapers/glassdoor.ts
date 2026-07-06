import type { RawReview } from '../types';
import { withPage } from './browser';
import { isLikelyBlocked } from './blockDetect';

// Glassdoor gates full review text behind a login wall for anonymous
// visitors (you typically only see truncated pros/cons), and aggressively
// detects automation. Expect this one to fall back to sample data often —
// that's expected and handled upstream, not a bug in this scraper.
export async function scrapeGlassdoor(url: string): Promise<RawReview[]> {
  return withPage(
    url,
    async (page) => {
      if (await isLikelyBlocked(page)) {
        throw new Error('Glassdoor served a bot-check/login wall');
      }
      return page.$$eval(
        '[class*="review-details"], [class*="empReview"]',
        (nodes) =>
          nodes.map((node) => {
            const ratingText = node.querySelector('[class*="rating"] [class*="value"]')?.textContent?.trim() ?? '';
            const rating = ratingText ? parseFloat(ratingText) : null;
            const pros = node.querySelector('[class*="pros"]')?.textContent?.trim() ?? '';
            const cons = node.querySelector('[class*="cons"]')?.textContent?.trim() ?? '';
            const author = null;
            const dateText = node.querySelector('time')?.getAttribute('datetime')?.slice(0, 10) || null;
            const text = [pros && `Pros: ${pros}`, cons && `Cons: ${cons}`].filter(Boolean).join(' | ');
            return { author, rating, text, date: dateText };
          })
      );
    },
    { timeoutMs: 20000 }
  ).then((reviews) => reviews.filter((r) => r.text.length > 0));
}
