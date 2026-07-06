export type Sentiment = 'pos' | 'neu' | 'neg';
export type SourceStatus = 'scraped' | 'failed';

export const PLATFORMS = [
  'amazon',
  'myntra',
  'flipkart',
  'trustpilot',
  'glassdoor',
  'ambitionbox',
  'reddit',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface RawReview {
  author?: string | null;
  rating?: number | null; // 1-5 when known
  text: string;
  date?: string | null; // ISO date when known
}

export interface Review extends RawReview {
  platform: Platform;
  sourceUrl: string;
  sentiment: Sentiment;
}

export interface SourceUrlResult {
  platform: Platform;
  url: string;
  status: SourceStatus;
  reviewsExtracted: number;
  avgRating: number | null;
  reason?: string | null;
}

export interface ComplaintTheme {
  kind: 'complaint' | 'praise';
  theme: string;
  count: number;
  example_snippet: string;
}

export interface UrlInput {
  platform: Platform;
  url: string;
}

export interface BrandReport {
  id: string;
  brandName: string;
  brandUrl: string | null;
  generatedAt: string;
  score: number | null; // null when no reviews could be extracted from any source
  verdictTitle: string;
  verdictText: string;
  sources: SourceUrlResult[];
  sentiment: { pos: number; neu: number; neg: number };
  platformBreakdown: {
    platform: Platform;
    reviewCount: number;
    avgRating: number | null;
    pos: number;
    neu: number;
    neg: number;
  }[];
  themes: ComplaintTheme[];
  reviews: Review[];
  fromCache: boolean;
}
