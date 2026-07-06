import { chromium, type Browser, type Page } from 'playwright';

const REALISTIC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          // Some sites (e.g. Myntra) trigger net::ERR_HTTP2_PROTOCOL_ERROR
          // under headless Chromium; forcing HTTP/1.1 sidesteps it and every
          // site supports the fallback.
          '--disable-http2',
          // Reduce the most obvious automation fingerprints.
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
        ],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

/**
 * Opens a fresh page against `url`, runs `extractFn` against the rendered
 * DOM, then closes just the page (the underlying browser process stays warm
 * so scraping several URLs in one report doesn't pay launch cost repeatedly).
 */
export async function withPage<T>(
  url: string,
  extractFn: (page: Page) => Promise<T>,
  opts?: { waitForSelector?: string; timeoutMs?: number }
): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: REALISTIC_UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-IN',
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts?.timeoutMs ?? 20000 });
    if (opts?.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: 8000 }).catch(() => {});
    } else {
      await page.waitForTimeout(1500);
    }
    return await extractFn(page);
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
