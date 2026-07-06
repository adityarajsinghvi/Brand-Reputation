import type { Page } from 'playwright';

const BLOCK_MARKERS = [
  'robot check',
  'captcha',
  'access denied',
  'unusual traffic',
  "confirm you're a human",
  'automated access',
  'pardon the interruption',
];

/** Cheap heuristic: many anti-bot walls announce themselves in the page text. */
export async function isLikelyBlocked(page: Page): Promise<boolean> {
  const bodyText = await page
    .evaluate(() => document.body?.innerText?.slice(0, 2000)?.toLowerCase() ?? '')
    .catch(() => '');
  return BLOCK_MARKERS.some((marker) => bodyText.includes(marker));
}
