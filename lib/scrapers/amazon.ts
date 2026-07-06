import type { RawReview } from '../types';
import { withPage } from './browser';
import { isLikelyBlocked } from './blockDetect';
import { assertAmazonReviewUrl } from './urlShape';

// Amazon.in migrated its review DOM: the review wrapper is still
// [data-hook="review"], but the inner hooks are now "reviewTitle" and
// "reviewText" (previously "review-title" / "review-body"). The reviewText
// node also carries screen-reader toggle cruft ("Brief content visible…",
// "Read more"/"Read less") that must be stripped. A product (…/dp/ASIN) page
// renders ~10-13 reviews inline, which is plenty without paging.
export async function scrapeAmazon(url: string): Promise<RawReview[]> {
  assertAmazonReviewUrl(url);
  return withPage(
    url,
    async (page) => {
      if (await isLikelyBlocked(page)) {
        throw new Error('Amazon served a bot-check page');
      }
      return page.$$eval('[data-hook="review"]', (nodes) => {
        const clean = (raw: string): string =>
          raw
            .replace(/Brief content visible, double tap to read full content\./gi, '')
            .replace(/Full content visible, double tap to read brief content\./gi, '')
            .replace(/\s*Read more\s*Read less\s*$/i, '')
            .replace(/\s*Read more\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();

        return nodes.map((node) => {
          const ratingText =
            node
              .querySelector(
                '[data-hook="review-star-rating"] .a-icon-alt, [data-hook="cmps-review-star-rating"] .a-icon-alt'
              )
              ?.textContent?.trim() ?? '';
          const ratingMatch = ratingText.match(/([\d.]+)\s*out of/i);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

          const title = clean(node.querySelector('[data-hook="reviewTitle"]')?.textContent ?? '');
          const body = clean(node.querySelector('[data-hook="reviewText"]')?.textContent ?? '');
          const author = node.querySelector('.a-profile-name')?.textContent?.trim() || null;
          const dateText = node.querySelector('[data-hook="review-date"]')?.textContent?.trim() || null;

          return {
            author,
            rating,
            text: [title, body].filter(Boolean).join(' — ').trim(),
            date: dateText,
          };
        });
      });
    },
    { waitForSelector: '[data-hook="review"]' }
  ).then((reviews) => reviews.filter((r) => r.text.length > 0));
}
