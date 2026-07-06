import type { RawReview } from '../types';
import { assertFlipkartReviewUrl } from './urlShape';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Flipkart's obfuscated, rotating class names make DOM scraping brittle, but
// its product pages embed schema.org JSON-LD reviews inside window.__INITIAL_STATE__
// (objects with "@type":"Review"). A plain fetch + JSON parse is far more robust
// than chasing hashed class names. A product (/p/) page embeds ~3 top reviews.
export async function scrapeFlipkart(url: string): Promise<RawReview[]> {
  assertFlipkartReviewUrl(url);

  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Flipkart returned ${res.status}`);
  }
  const html = await res.text();

  const state = extractJsonAfter(html, 'window.__INITIAL_STATE__');
  if (!state) {
    throw new Error('Could not locate Flipkart review data in the page');
  }

  const reviewObjs: SchemaReview[] = [];
  collectReviews(state, reviewObjs);

  const seen = new Set<string>();
  return reviewObjs
    .map((r) => {
      const title = typeof r.name === 'string' ? r.name.trim() : '';
      const body = typeof r.reviewBody === 'string' ? r.reviewBody.trim() : '';
      const rating =
        r.reviewRating && typeof r.reviewRating.ratingValue === 'number' ? r.reviewRating.ratingValue : null;
      const author = r.author && typeof r.author.name === 'string' ? r.author.name.trim() : null;
      const date = typeof r.datePublished === 'string' ? r.datePublished.slice(0, 10) : null;
      return { author, rating, text: [title, body].filter(Boolean).join(' — ').trim(), date };
    })
    .filter((r) => {
      if (r.text.length === 0 || seen.has(r.text)) return false;
      seen.add(r.text);
      return true;
    });
}

interface SchemaReview {
  '@type'?: string;
  name?: unknown;
  reviewBody?: unknown;
  datePublished?: unknown;
  author?: { name?: unknown };
  reviewRating?: { ratingValue?: unknown };
}

/** Recursively collect every object marked as a schema.org Review. */
function collectReviews(node: unknown, out: SchemaReview[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 14) return;
  if (Array.isArray(node)) {
    for (const v of node) collectReviews(v, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj['@type'] === 'Review' && (obj.reviewBody || obj.name)) {
    out.push(obj as SchemaReview);
  }
  for (const v of Object.values(obj)) collectReviews(v, out, depth + 1);
}

/** Extracts and parses the balanced JSON object assigned after `marker` in HTML. */
function extractJsonAfter(html: string, marker: string): unknown | null {
  const m = html.indexOf(marker);
  if (m === -1) return null;
  const start = html.indexOf('{', m);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
