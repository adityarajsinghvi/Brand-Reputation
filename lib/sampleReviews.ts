import type { RawReview, Platform, Sentiment } from './types';
import { rngFor, pick, randInt } from './rng';

// Clearly-labeled fallback content used only when live scraping fails or is
// blocked for a given URL — callers mark these as 'sample_fallback' so the
// UI can be honest about what's real vs representative sample data.

const ECOM_POS = [
  'Fast delivery and the product matched exactly what was shown online.',
  'Great quality for the price, would buy again.',
  'Customer support resolved my issue within a day, impressed.',
  'Packaging was solid, no damage at all.',
];
const ECOM_NEG = [
  'Delivery was 5 days late and no one updated me.',
  'Item received was a different size than ordered.',
  'Packaging was crushed, product arrived damaged.',
  'Refund has been pending for over two weeks now.',
  'Customer support just kept forwarding me between departments.',
];
const ECOM_NEU = [
  'Product is okay, nothing special but does the job.',
  'Average experience, delivery took the standard time.',
];

const EMP_POS = [
  'Pros: Great work-life balance and supportive managers.',
  'Pros: Strong learning culture, lots of ownership early on.',
  'Pros: Compensation is competitive for the role.',
];
const EMP_NEG = [
  'Cons: Promotions are slow and feel political.',
  'Cons: Workload spikes hard during peak season with no extra support.',
  'Cons: Middle management communication is inconsistent.',
];

const REDDIT_POS = [
  'Honestly {b} has improved a lot this year, no complaints.',
  'PSA: {b} support actually fixed my issue same day.',
];
const REDDIT_NEU = [
  'Anyone have recent experience with {b}? Thinking of trying it.',
  '{b} vs alternatives, worth it in 2026?',
];
const REDDIT_NEG = [
  'Anyone else disappointed with {b} lately?',
  'PSA: {b} customer support ghosted me for weeks.',
];

const SENTIMENT_BUCKETS: Sentiment[] = ['pos', 'neu', 'neg'];

export function generateSampleReviews(platform: Platform, brandName: string): RawReview[] {
  const rng = rngFor(`${platform}:${brandName.toLowerCase()}`);
  const count = randInt(rng, 5, 9);
  const reviews: RawReview[] = [];

  for (let i = 0; i < count; i++) {
    if (platform === 'reddit') {
      const bucket = pick(rng, SENTIMENT_BUCKETS);
      const pool = bucket === 'pos' ? REDDIT_POS : bucket === 'neu' ? REDDIT_NEU : REDDIT_NEG;
      const impliedRating = bucket === 'pos' ? 5 : bucket === 'neu' ? 3 : 1;
      reviews.push({ author: null, rating: impliedRating, text: pick(rng, pool).replace('{b}', brandName), date: null });
    } else if (platform === 'glassdoor' || platform === 'ambitionbox') {
      const isPos = rng() > 0.45;
      reviews.push({
        author: null,
        rating: isPos ? randInt(rng, 4, 5) : randInt(rng, 1, 2),
        text: isPos ? pick(rng, EMP_POS) : pick(rng, EMP_NEG),
        date: null,
      });
    } else {
      const roll = rng();
      const text = roll < 0.45 ? pick(rng, ECOM_POS) : roll < 0.7 ? pick(rng, ECOM_NEG) : pick(rng, ECOM_NEU);
      const rating = roll < 0.45 ? randInt(rng, 4, 5) : roll < 0.7 ? randInt(rng, 1, 2) : 3;
      reviews.push({ author: null, rating, text, date: null });
    }
  }
  return reviews;
}
