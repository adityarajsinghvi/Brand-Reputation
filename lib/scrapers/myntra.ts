import type { RawReview } from '../types';
import { assertMyntraReviewUrl } from './urlShape';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const DATACENTER_BLOCK_MSG =
  'Myntra blocked this server (common on Vercel/AWS datacenter IPs). Run analysis locally with npm run dev, or use Flipkart / Reddit / AmbitionBox URLs on production.';

// Myntra actively resets headless-Chromium connections (TLS fingerprinting),
// so a browser scrape fails with ERR_CONNECTION_RESET. A plain fetch, however,
// succeeds from residential networks — and Myntra server-renders its review
// data into a `window.__myx` JSON blob in the page HTML.
export async function scrapeMyntra(url: string): Promise<RawReview[]> {
  assertMyntraReviewUrl(url);

  let html = await fetchMyntraHtml(url);
  let state = extractMyxState(html);

  if (!state) {
    const styleId = extractStyleId(url);
    if (styleId) {
      const shortUrl = `https://www.myntra.com/${styleId}/buy`;
      if (shortUrl !== normalizeUrl(url)) {
        html = await fetchMyntraHtml(shortUrl);
        state = extractMyxState(html);
      }
    }
  }

  if (!state) {
    if (isLikelyDatacenterBlock(html)) {
      throw new Error(DATACENTER_BLOCK_MSG);
    }
    throw new Error('Could not locate Myntra review data in the page');
  }

  const reviewInfo = findKey<Record<string, unknown>>(state, 'reviewInfo');
  const topReviews = (reviewInfo?.topReviews as MyntraReview[] | undefined) ?? [];
  const topImageReviews = (reviewInfo?.topImageReviews as MyntraReview[] | undefined) ?? [];

  const byId = new Map<string, MyntraReview>();
  for (const r of [...topReviews, ...topImageReviews]) {
    if (r?.reviewId && !byId.has(r.reviewId)) byId.set(r.reviewId, r);
  }

  const reviews = Array.from(byId.values())
    .map((r) => ({
      author: r.userName ?? null,
      rating: typeof r.userRating === 'number' ? r.userRating : null,
      text: cleanText(r.reviewText ?? ''),
      date: parseEpoch(r.timestamp),
    }))
    .filter((r) => r.text.length > 0);

  if (reviews.length === 0 && isLikelyDatacenterBlock(html)) {
    throw new Error(DATACENTER_BLOCK_MSG);
  }

  return reviews;
}

interface MyntraReview {
  reviewId?: string;
  userName?: string;
  reviewText?: string;
  userRating?: number;
  timestamp?: string | number;
}

async function fetchMyntraHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
  if (res.status === 403) {
    throw new Error(DATACENTER_BLOCK_MSG);
  }
  if (!res.ok) {
    throw new Error(`Myntra returned ${res.status}`);
  }
  return res.text();
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

function extractStyleId(url: string): string | null {
  const path = new URL(url).pathname;
  const match = path.match(/\/(\d{6,})\/buy\/?$/i) ?? path.match(/\/(\d{6,})\/?$/);
  return match?.[1] ?? null;
}

function isLikelyDatacenterBlock(html: string): boolean {
  if (html.includes('window.__myx = ')) return false;
  return (
    html.length < 100_000 ||
    /access\s*denied|captcha|challenge-platform|cf-browser-verification|bot detection/i.test(html) ||
    !html.toLowerCase().includes('myntra')
  );
}

function parseEpoch(ts: string | number | undefined): string | null {
  if (ts === undefined || ts === null) return null;
  const ms = Number(ts);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function cleanText(raw: string): string {
  return raw
    .replace(/^[:\s"]+/, '')
    .replace(/["\s]+$/, '')
    .trim();
}

/** Extracts and parses the `window.__myx = {...}` state object from page HTML. */
function extractMyxState(html: string): unknown | null {
  const marker = 'window.__myx = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const slice = extractBalancedJson(html, jsonStart, '{');
  if (!slice) return null;
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

/**
 * Returns the balanced JSON slice starting at `openChar` ({ or [), respecting
 * quoted strings — naive brace counting breaks when review text contains }.
 */
function extractBalancedJson(text: string, startIdx: number, openChar: '{' | '['): string | null {
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  return null;
}

function findKey<T>(obj: unknown, key: string, depth = 0): T | null {
  if (!obj || typeof obj !== 'object' || depth > 12) return null;
  if (key in (obj as Record<string, unknown>)) return (obj as Record<string, T>)[key];
  for (const value of Object.values(obj as Record<string, unknown>)) {
    const found = findKey<T>(value, key, depth + 1);
    if (found) return found;
  }
  return null;
}
