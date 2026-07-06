import type { RawReview } from '../types';
import { assertMyntraReviewUrl } from './urlShape';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Myntra actively resets headless-Chromium connections (TLS fingerprinting),
// so a browser scrape fails with ERR_CONNECTION_RESET. A plain fetch, however,
// succeeds — and Myntra server-renders its review data into a `window.__myx`
// JSON blob in the page HTML. So we fetch the HTML and parse that state
// directly, no browser required.
export async function scrapeMyntra(url: string): Promise<RawReview[]> {
  assertMyntraReviewUrl(url);

  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) {
    throw new Error(`Myntra returned ${res.status}`);
  }
  const html = await res.text();

  const state = extractMyxState(html);
  if (!state) {
    throw new Error('Could not locate Myntra review data in the page');
  }

  const reviewInfo = findKey<Record<string, unknown>>(state, 'reviewInfo');
  const topReviews = (reviewInfo?.topReviews as MyntraReview[] | undefined) ?? [];
  const topImageReviews = (reviewInfo?.topImageReviews as MyntraReview[] | undefined) ?? [];

  const byId = new Map<string, MyntraReview>();
  for (const r of [...topReviews, ...topImageReviews]) {
    if (r?.reviewId && !byId.has(r.reviewId)) byId.set(r.reviewId, r);
  }

  return Array.from(byId.values())
    .map((r) => ({
      author: r.userName ?? null,
      rating: typeof r.userRating === 'number' ? r.userRating : null,
      text: cleanText(r.reviewText ?? ''),
      date: parseEpoch(r.timestamp),
    }))
    .filter((r) => r.text.length > 0);
}

interface MyntraReview {
  reviewId?: string;
  userName?: string;
  reviewText?: string;
  userRating?: number;
  timestamp?: string | number; // epoch millis, usually as a string
}

/** Myntra ships timestamps as epoch-millis strings; parse defensively. */
function parseEpoch(ts: string | number | undefined): string | null {
  if (ts === undefined || ts === null) return null;
  const ms = Number(ts);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function cleanText(raw: string): string {
  return raw
    .replace(/^[:\s"]+/, '') // some entries are prefixed with `: "`
    .replace(/["\s]+$/, '')
    .trim();
}

/** Extracts and parses the `window.__myx = {...}` state object from page HTML. */
function extractMyxState(html: string): unknown | null {
  const marker = 'window.__myx = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const after = html.slice(start + marker.length);

  let depth = 0;
  let end = -1;
  for (let i = 0; i < after.length; i++) {
    const c = after[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;

  try {
    return JSON.parse(after.slice(0, end));
  } catch {
    return null;
  }
}

/** Depth-first search for the first occurrence of `key` anywhere in the state tree. */
function findKey<T>(obj: unknown, key: string, depth = 0): T | null {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  if (key in (obj as Record<string, unknown>)) return (obj as Record<string, T>)[key];
  for (const value of Object.values(obj as Record<string, unknown>)) {
    const found = findKey<T>(value, key, depth + 1);
    if (found) return found;
  }
  return null;
}
