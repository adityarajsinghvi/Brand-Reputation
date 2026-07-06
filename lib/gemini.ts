// Flash-Lite tier: highest free-tier request volume of the available models,
// and plenty capable for short classification/extraction/JSON tasks like ours.
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Calls Gemini Flash and parses a structured JSON response.
 * Returns null (never throws) when the key is missing or the call fails,
 * so callers can fall back to rule-based logic per the Promise.allSettled
 * "one module failing shouldn't sink the request" pattern.
 */
export async function geminiGenerateJson<T>(opts: {
  systemInstruction: string;
  prompt: string;
}): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    if (!res.ok) {
      console.error('Gemini request failed', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    console.error('Gemini call threw', err);
    return null;
  }
}

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}
