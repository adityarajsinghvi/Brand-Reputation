import type { Platform, RawReview } from '../types';
import { PLATFORMS } from '../types';
import { scrapeAmazon } from './amazon';
import { scrapeMyntra } from './myntra';
import { scrapeFlipkart } from './flipkart';
import { scrapeTrustpilot } from './trustpilot';
import { scrapeGlassdoor } from './glassdoor';
import { scrapeAmbitionBox } from './ambitionbox';
import { scrapeReddit } from './reddit';

export function detectPlatform(url: string): Platform | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  if (host.includes('amazon')) return 'amazon';
  if (host.includes('myntra')) return 'myntra';
  if (host.includes('flipkart')) return 'flipkart';
  if (host.includes('trustpilot')) return 'trustpilot';
  if (host.includes('glassdoor')) return 'glassdoor';
  if (host.includes('ambitionbox')) return 'ambitionbox';
  if (host.includes('reddit')) return 'reddit';
  return null;
}

export function isSupportedPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

const SCRAPERS: Record<Platform, (url: string) => Promise<RawReview[]>> = {
  amazon: scrapeAmazon,
  myntra: scrapeMyntra,
  flipkart: scrapeFlipkart,
  trustpilot: scrapeTrustpilot,
  glassdoor: scrapeGlassdoor,
  ambitionbox: scrapeAmbitionBox,
  reddit: scrapeReddit,
};

export interface ScrapeOutcome {
  platform: Platform;
  url: string;
  status: 'scraped' | 'failed';
  reviews: RawReview[];
  reason?: string;
}

export async function scrapeUrl(platform: Platform, url: string): Promise<ScrapeOutcome> {
  try {
    const reviews = await SCRAPERS[platform](url);
    if (!reviews || reviews.length === 0) {
      return { platform, url, status: 'failed', reviews: [], reason: 'No reviews found at this URL' };
    }
    return { platform, url, status: 'scraped', reviews };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown scraping error';
    console.error(`[scrape] ${platform} failed for ${url}:`, reason);
    return { platform, url, status: 'failed', reviews: [], reason };
  }
}
