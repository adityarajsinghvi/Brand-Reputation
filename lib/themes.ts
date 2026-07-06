import type { Review, ComplaintTheme } from './types';
import { geminiGenerateJson, hasGeminiKey } from './gemini';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'was', 'were', 'have', 'has',
  'are', 'not', 'but', 'you', 'your', 'from', 'they', 'them', 'she', 'him',
  'his', 'her', 'their', 'about', 'would', 'could', 'there', 'been', 'into',
]);

function keywordFallbackThemes(reviews: Review[]): ComplaintTheme[] {
  const negWords: Record<string, { count: number; example: string }> = {};
  const posWords: Record<string, { count: number; example: string }> = {};

  for (const r of reviews) {
    const bucket = r.sentiment === 'neg' ? negWords : r.sentiment === 'pos' ? posWords : null;
    if (!bucket) continue;
    const words = r.text
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOPWORDS.has(w));
    for (const w of new Set(words)) {
      if (!bucket[w]) bucket[w] = { count: 0, example: r.text.slice(0, 140) };
      bucket[w].count++;
    }
  }

  const topFrom = (bucket: Record<string, { count: number; example: string }>, kind: 'complaint' | 'praise') =>
    Object.entries(bucket)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([theme, v]) => ({ kind, theme, count: v.count, example_snippet: v.example }));

  return [...topFrom(negWords, 'complaint'), ...topFrom(posWords, 'praise')];
}

export async function extractThemes(reviews: Review[]): Promise<ComplaintTheme[]> {
  if (reviews.length === 0) return [];
  if (!hasGeminiKey()) return keywordFallbackThemes(reviews);

  const sample = reviews.slice(0, 60);
  const prompt = sample.map((r, i) => `${i} [${r.platform}]: ${r.text.slice(0, 400)}`).join('\n');

  const result = await geminiGenerateJson<{
    complaints: { theme: string; count: number; example_snippet: string }[];
    praises: { theme: string; count: number; example_snippet: string }[];
  }>({
    systemInstruction:
      'You analyze a pool of customer/employee reviews about one brand, gathered from multiple platforms. Identify up to 5 of the most common complaint themes and up to 5 most common praise themes. For each theme return a short label, an approximate count of how many reviews mention it, and one representative example snippet (verbatim, under 25 words) from the input. Return JSON: {"complaints":[{"theme":string,"count":number,"example_snippet":string}],"praises":[{"theme":string,"count":number,"example_snippet":string}]}',
    prompt,
  });

  if (!result) return keywordFallbackThemes(reviews);

  return [
    ...result.complaints.map((c) => ({ kind: 'complaint' as const, ...c })),
    ...result.praises.map((p) => ({ kind: 'praise' as const, ...p })),
  ];
}
