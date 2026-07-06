/**
 * Cheap upfront checks that reject URLs which structurally can't contain
 * reviews (brand storefronts, category/search listings, homepages) before
 * spending 5-10s launching a browser against them. Without this, a mistaken
 * URL silently returns zero reviews and looks identical to a blocked/failed
 * scrape once sample-data fallback kicks in.
 */

export function assertAmazonReviewUrl(url: string): void {
  const path = new URL(url).pathname;
  if (/\/stores\//i.test(path)) {
    throw new Error('This looks like an Amazon brand storefront page, which has no review content — paste a product page (…/dp/ASIN) or a product-reviews page (…/product-reviews/ASIN) instead.');
  }
  if (/^\/s(\/|$)|\/s\?/i.test(path) || /\/b\//i.test(path)) {
    throw new Error('This looks like an Amazon search/category listing page, which has no review content — paste a specific product page instead.');
  }
}

export function assertFlipkartReviewUrl(url: string): void {
  const path = new URL(url).pathname;
  if (!/\/p\//i.test(path) && !/product-reviews/i.test(path)) {
    throw new Error('This doesn\'t look like a Flipkart product page — paste a specific product URL (contains "/p/") instead.');
  }
}

export function assertMyntraReviewUrl(url: string): void {
  const path = new URL(url).pathname;
  if (!/\/buy$/i.test(path) && !/\d{6,}/.test(path)) {
    throw new Error('This doesn\'t look like a Myntra product page — paste a specific product URL instead.');
  }
}
