import type { RawReview, Review, Sentiment, Platform } from './types';
import { geminiGenerateJson, hasGeminiKey } from './gemini';

const POSITIVE_WORDS = [
  'great', 'excellent', 'love', 'amazing', 'good', 'fast', 'helpful',
  'recommend', 'perfect', 'happy', 'best', 'quality', 'worth', 'impressed',
];
const NEGATIVE_WORDS = [
  'bad', 'worst', 'terrible', 'poor', 'slow', 'rude', 'disappointed',
  'refund', 'broken', 'damaged', 'scam', 'waste', 'horrible', 'delay', 'ghosted',
];

function keywordSentiment(text: string): Sentiment {
  const lower = text.toLowerCase();
  const posScore = POSITIVE_WORDS.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
  const negScore = NEGATIVE_WORDS.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
  if (posScore === negScore) return 'neu';
  return posScore > negScore ? 'pos' : 'neg';
}

function sentimentFromRating(rating: number): Sentiment {
  if (rating >= 4) return 'pos';
  if (rating <= 2) return 'neg';
  return 'neu';
}

export interface TaggedReview extends RawReview {
  platform: Platform;
  sourceUrl: string;
}

/**
 * Assigns sentiment to every review: rating-derived when a star rating is
 * known, otherwise Gemini-classified in batches, falling back to a simple
 * keyword heuristic when Gemini is unavailable or a batch call fails.
 */
export async function classifySentiments(reviews: TaggedReview[]): Promise<Review[]> {
  const withRating: Review[] = [];
  const needsClassification: TaggedReview[] = [];

  for (const r of reviews) {
    if (typeof r.rating === 'number' && !Number.isNaN(r.rating)) {
      withRating.push({ ...r, sentiment: sentimentFromRating(r.rating) });
    } else {
      needsClassification.push(r);
    }
  }

  if (needsClassification.length === 0) return withRating;

  if (!hasGeminiKey()) {
    const fallback = needsClassification.map((r) => ({ ...r, sentiment: keywordSentiment(r.text) }));
    return [...withRating, ...fallback];
  }

  const BATCH_SIZE = 25;
  const classified: Review[] = [];
  for (let i = 0; i < needsClassification.length; i += BATCH_SIZE) {
    const batch = needsClassification.slice(i, i + BATCH_SIZE);
    const prompt = batch.map((r, idx) => `${idx}: ${r.text.slice(0, 500)}`).join('\n');
    const result = await geminiGenerateJson<{ index: number; sentiment: Sentiment }[]>({
      systemInstruction:
        'You classify short customer or employee comments as overall sentiment toward the brand/company. Return a JSON array of {"index": number, "sentiment": "pos"|"neu"|"neg"}, one entry per input line, matching every index exactly once.',
      prompt,
    });
    if (result) {
      const byIndex = new Map(result.map((r) => [r.index, r.sentiment]));
      batch.forEach((r, idx) => {
        classified.push({ ...r, sentiment: byIndex.get(idx) ?? keywordSentiment(r.text) });
      });
    } else {
      batch.forEach((r) => classified.push({ ...r, sentiment: keywordSentiment(r.text) }));
    }
  }

  return [...withRating, ...classified];
}
