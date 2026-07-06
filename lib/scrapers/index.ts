import type { Platform, RawReview } from '../types';
import { PLATFORMS } from '../types';

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

type ScraperFn = (url: string) => Promise<RawReview[]>;

// Load each scraper on demand so Playwright (Amazon/Trustpilot/Glassdoor) is never
// pulled into the serverless bundle unless that platform is actually requested.
async function loadScraper(platform: Platform): Promise<ScraperFn> {
  switch (platform) {
    case 'amazon':
      return (await import('./amazon')).scrapeAmazon;
    case 'myntra':
      return (await import('./myntra')).scrapeMyntra;
    case 'flipkart':
      return (await import('./flipkart')).scrapeFlipkart;
    case 'trustpilot':
      return (await import('./trustpilot')).scrapeTrustpilot;
    case 'glassdoor':
      return (await import('./glassdoor')).scrapeGlassdoor;
    case 'ambitionbox':
      return (await import('./ambitionbox')).scrapeAmbitionBox;
    case 'reddit':
      return (await import('./reddit')).scrapeReddit;
  }
}

export interface ScrapeOutcome {
  platform: Platform;
  url: string;
  status: 'scraped' | 'failed';
  reviews: RawReview[];
  reason?: string;
}

export async function scrapeUrl(platform: Platform, url: string): Promise<ScrapeOutcome> {
  try {
    const scraper = await loadScraper(platform);
    const reviews = await scraper(url);
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
