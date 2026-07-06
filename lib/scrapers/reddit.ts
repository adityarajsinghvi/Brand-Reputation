import type { RawReview } from '../types';

const UA = 'brand-reputation-hackathon-bot/1.0 (by /u/hackathon-demo)';

// Reddit's public read API: append .json to a thread URL, or use search.json
// for a search URL. No auth needed, but a descriptive User-Agent is required
// or Reddit returns 429/403. Note: Reddit also blocks many datacenter/cloud
// IPs outright (403 "blocked by network security") — that block is IP-based,
// not a bug here, and typically doesn't apply from a residential connection.
export async function scrapeReddit(url: string): Promise<RawReview[]> {
  const u = new URL(url);
  const isSearch = /\/search\/?$/.test(u.pathname) || u.searchParams.has('q');

  const jsonUrl = isSearch ? buildSearchJson(u) : buildThreadJson(u);

  const res = await fetch(jsonUrl, { headers: { 'User-Agent': UA } });
  if (res.status === 403) {
    throw new Error('Reddit blocked the request (likely an IP-level block on this network; usually works from a normal connection)');
  }
  if (!res.ok) {
    throw new Error(`Reddit returned ${res.status}`);
  }
  const data = await res.json();

  return isSearch ? parseSearchListing(data) : parseThread(data);
}

function buildSearchJson(u: URL): string {
  const q = u.searchParams.get('q') ?? '';
  if (!q) throw new Error('Reddit search URL has no query (q) parameter');
  return `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&limit=25&sort=relevance`;
}

function buildThreadJson(u: URL): string {
  let path = u.pathname;
  if (!path.endsWith('/')) path += '/';
  return `https://www.reddit.com${path}.json?limit=40&depth=1`;
}

/** A search listing is a flat list of t3 posts; use title + selftext as items. */
function parseSearchListing(data: unknown): RawReview[] {
  const children = (data as { data?: { children?: RedditChild[] } })?.data?.children ?? [];
  const reviews: RawReview[] = [];
  for (const c of children) {
    if (c.kind !== 't3') continue;
    const d = c.data;
    const text = [d.title, d.selftext].filter(Boolean).join(' — ').trim();
    if (!text) continue;
    reviews.push({
      author: d.author ?? null,
      rating: null,
      text,
      date: d.created_utc ? new Date(d.created_utc * 1000).toISOString().slice(0, 10) : null,
    });
  }
  return reviews.slice(0, 40);
}

/** A thread response is [postListing, commentListing]; use post + top comments. */
function parseThread(data: unknown): RawReview[] {
  const arr = data as [PostListing, CommentListing];
  const reviews: RawReview[] = [];

  const post = arr?.[0]?.data?.children?.[0]?.data;
  if (post) {
    const text = [post.title, post.selftext].filter(Boolean).join(' — ').trim();
    if (text) {
      reviews.push({
        author: post.author ?? null,
        rating: null,
        text,
        date: post.created_utc ? new Date(post.created_utc * 1000).toISOString().slice(0, 10) : null,
      });
    }
  }

  const comments = arr?.[1]?.data?.children ?? [];
  for (const c of comments) {
    if (c.kind !== 't1') continue;
    const body = c.data?.body;
    if (!body || body === '[deleted]' || body === '[removed]') continue;
    reviews.push({
      author: c.data.author ?? null,
      rating: null,
      text: body,
      date: c.data.created_utc ? new Date(c.data.created_utc * 1000).toISOString().slice(0, 10) : null,
    });
  }

  return reviews.slice(0, 40);
}

interface RedditPostData {
  title?: string;
  selftext?: string;
  author?: string;
  created_utc?: number;
  body?: string;
}
interface RedditChild {
  kind: string;
  data: RedditPostData;
}
interface PostListing {
  data?: { children?: { data: RedditPostData }[] };
}
interface CommentListing {
  data?: { children?: RedditChild[] };
}
