import type { RawReview } from '../types';
import { withPage } from './browser';
import { isLikelyBlocked } from './blockDetect';

// Trustpilot's review cards use stable data-service-review-* attributes,
// making this one of the more reliable scrapers in the set.
export async function scrapeTrustpilot(url: string): Promise<RawReview[]> {
  return withPage(
    url,
    async (page) => {
      if (await isLikelyBlocked(page)) {
        throw new Error('Trustpilot served a bot-check page');
      }
      return page.$$eval('article[data-service-review-card-paper], [data-service-review-card-paper]', (nodes) =>
        nodes.map((node) => {
          const ratingImg = node.querySelector('[data-service-review-rating] img, img[alt*="Rated"]');
          const alt = ratingImg?.getAttribute('alt') ?? '';
          const ratingMatch = alt.match(/Rated (\d)/i);
          const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;
          const title = node.querySelector('[data-service-review-title-typography]')?.textContent?.trim() ?? '';
          const body = node.querySelector('[data-service-review-text-typography]')?.textContent?.trim() ?? '';
          const author = node.querySelector('[data-consumer-name-typography]')?.textContent?.trim() || null;
          const dateEl = node.querySelector('time');
          const dateText = dateEl?.getAttribute('datetime')?.slice(0, 10) || null;
          return {
            author,
            rating,
            text: [title, body].filter(Boolean).join(' — ').trim(),
            date: dateText,
          };
        })
      );
    },
    { waitForSelector: 'article[data-service-review-card-paper], [data-service-review-card-paper]' }
  ).then((reviews) => reviews.filter((r) => r.text.length > 0));
}
