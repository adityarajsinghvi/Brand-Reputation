"use client";

import { useEffect, useState } from "react";
import type { BrandReport, Platform, Review } from "@/lib/types";
import { PLATFORMS } from "@/lib/types";

const PLATFORM_LABELS: Record<Platform, string> = {
  amazon: "Amazon",
  myntra: "Myntra",
  flipkart: "Flipkart",
  trustpilot: "Trustpilot",
  glassdoor: "Glassdoor",
  ambitionbox: "AmbitionBox",
  reddit: "Reddit thread",
};

const PLATFORM_PLACEHOLDER: Record<Platform, string> = {
  amazon: "https://www.amazon.in/product-reviews/...",
  myntra: "https://www.myntra.com/.../buy",
  flipkart: "https://www.flipkart.com/.../product-reviews/...",
  trustpilot: "https://www.trustpilot.com/review/...",
  glassdoor: "https://www.glassdoor.co.in/Reviews/...",
  ambitionbox: "https://www.ambitionbox.com/reviews/...-reviews",
  reddit: "https://www.reddit.com/r/.../comments/...",
};

function getUrlWarning(platform: Platform, url: string): string | null {
  if (!url.trim()) return null;
  try {
    const path = new URL(url).pathname;
    if (platform === "amazon" && /\/stores\//i.test(path)) {
      return "This looks like a brand storefront page, not a product review page — it likely has no reviews to scrape.";
    }
    if (platform === "amazon" && (/^\/s(\/|$|\?)/i.test(path) || /\/b\//i.test(path))) {
      return "This looks like a search/category page, not a product page.";
    }
    if (platform === "flipkart" && !/\/p\//i.test(path) && !/product-reviews/i.test(path)) {
      return "This doesn't look like a Flipkart product page.";
    }
  } catch {
    return "That doesn't look like a valid URL.";
  }
  return null;
}

interface UrlRow {
  id: string;
  platform: Platform;
  url: string;
}

let rowIdCounter = 0;
function newRow(platform: Platform = "amazon"): UrlRow {
  rowIdCounter += 1;
  return { id: `row-${rowIdCounter}`, platform, url: "" };
}

type Screen = "input" | "loading" | "dashboard";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("input");
  const [brandName, setBrandName] = useState("");
  const [brandUrl, setBrandUrl] = useState("");
  const [rows, setRows] = useState<UrlRow[]>([newRow("amazon")]);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BrandReport | null>(null);
  const [tickIndex, setTickIndex] = useState(0);

  const filledRows = rows.filter((r) => r.url.trim().length > 0);

  useEffect(() => {
    if (screen !== "loading") return;
    const interval = setInterval(() => {
      setTickIndex((i) => (i < filledRows.length ? i + 1 : i));
    }, 900);
    return () => clearInterval(interval);
  }, [screen, filledRows.length]);

  function addRow() {
    setRows((r) => [...r, newRow("amazon")]);
  }
  function removeRow(id: string) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.id !== id) : r));
  }
  function updateRow(id: string, patch: Partial<UrlRow>) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function handleSubmit() {
    const trimmedBrand = brandName.trim();
    if (!trimmedBrand) {
      setError("Please enter a brand name.");
      return;
    }
    if (filledRows.length === 0) {
      setError("Add at least one platform URL to analyze.");
      return;
    }
    setError(null);
    setTickIndex(0);
    setScreen("loading");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: trimmedBrand,
          brandUrl: brandUrl.trim() || undefined,
          urls: filledRows.map((r) => ({ platform: r.platform, url: r.url.trim() })),
        }),
      });
      const text = await res.text();
      let data: { error?: string };
      try {
        data = JSON.parse(text) as { error?: string };
      } catch {
        throw new Error(
          `Server error (${res.status}). Check Vercel function logs — redeploy after adding env vars if you just set them.`
        );
      }
      if (!res.ok) {
        throw new Error(data?.error || "Analysis failed");
      }
      setTickIndex(filledRows.length);
      setReport(data as BrandReport);
      setTimeout(() => setScreen("dashboard"), 350);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setScreen("input");
    }
  }

  function resetToInput() {
    setScreen("input");
    setReport(null);
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
        <div className="w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
        <span className="font-semibold tracking-tight">Brand Reputation Intelligence</span>
        <div className="ml-auto text-xs text-text-dim border border-border rounded-full px-2.5 py-1">
          {report ? (report.fromCache ? `cache hit — ${report.brandName}` : `live analysis — ${report.brandName}`) : "no analysis yet"}
        </div>
      </div>

      {screen === "input" && (
        <InputScreen
          brandName={brandName}
          setBrandName={setBrandName}
          brandUrl={brandUrl}
          setBrandUrl={setBrandUrl}
          rows={rows}
          addRow={addRow}
          removeRow={removeRow}
          updateRow={updateRow}
          error={error}
          onSubmit={handleSubmit}
        />
      )}

      {screen === "loading" && <LoadingScreen brandName={brandName} rows={filledRows} tickIndex={tickIndex} />}

      {screen === "dashboard" && report && <Dashboard report={report} onBack={resetToInput} />}
    </div>
  );
}

function InputScreen(props: {
  brandName: string;
  setBrandName: (v: string) => void;
  brandUrl: string;
  setBrandUrl: (v: string) => void;
  rows: UrlRow[];
  addRow: () => void;
  removeRow: (id: string) => void;
  updateRow: (id: string, patch: Partial<UrlRow>) => void;
  error: string | null;
  onSubmit: () => void;
}) {
  const { brandName, setBrandName, brandUrl, setBrandUrl, rows, addRow, removeRow, updateRow, error, onSubmit } = props;

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="bg-card border border-border rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-1">New Analysis</h1>
        <p className="text-sm text-text-dim mb-6">
          Paste the exact review pages for this brand — we&apos;ll crawl each one, pool every review, and run
          sentiment + theme analysis across all of it.
        </p>

        <label className="block text-xs text-text-dim mb-1.5">Brand name *</label>
        <input
          className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-[#0d0f13] text-text text-sm outline-none focus:border-accent"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="e.g. Nike"
        />

        <label className="block text-xs text-text-dim mb-1.5 mt-4">Brand URL (optional, for disambiguation)</label>
        <input
          className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-[#0d0f13] text-text text-sm outline-none focus:border-accent"
          value={brandUrl}
          onChange={(e) => setBrandUrl(e.target.value)}
          placeholder="https://..."
        />

        <label className="block text-xs text-text-dim mb-1.5 mt-5">Review platform URLs</label>
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => {
            const warning = getUrlWarning(row.platform, row.url);
            return (
              <div key={row.id}>
                <div className="flex gap-2">
                  <select
                    className="rounded-lg border border-border bg-[#0d0f13] text-text text-sm px-2.5 py-2.5 outline-none focus:border-accent"
                    value={row.platform}
                    onChange={(e) => updateRow(row.id, { platform: e.target.value as Platform })}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </option>
                    ))}
                  </select>
                  <input
                    className="flex-1 min-w-0 px-3.5 py-2.5 rounded-lg border border-border bg-[#0d0f13] text-text text-sm outline-none focus:border-accent"
                    value={row.url}
                    onChange={(e) => updateRow(row.id, { url: e.target.value })}
                    placeholder={PLATFORM_PLACEHOLDER[row.platform]}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="px-3 rounded-lg border border-border text-text-dim hover:text-text hover:border-negative shrink-0"
                    aria-label="Remove row"
                  >
                    ×
                  </button>
                </div>
                {warning && <div className="text-neutral text-xs mt-1.5 ml-1">⚠ {warning}</div>}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2.5 text-sm text-accent hover:brightness-110 self-start"
        >
          + Add another URL
        </button>

        {error && <div className="text-negative text-sm mt-4">{error}</div>}

        <button
          type="button"
          onClick={onSubmit}
          className="w-full mt-6 bg-accent hover:brightness-110 text-white font-semibold py-3.5 rounded-lg transition"
        >
          Generate Reputation Report
        </button>
        <p className="text-xs text-text-dim mt-3">
          Amazon/Myntra/Flipkart/Glassdoor/AmbitionBox are scraped best-effort — if a site blocks extraction, that
          source falls back to clearly-labeled sample data instead of failing the whole report. Every run re-crawls
          all URLs fresh.
        </p>
      </div>
    </main>
  );
}

function LoadingScreen({ brandName, rows, tickIndex }: { brandName: string; rows: UrlRow[]; tickIndex: number }) {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h2 className="text-xl font-bold mb-1.5">Analyzing &quot;{brandName}&quot;…</h2>
      <p className="text-sm text-text-dim mb-10">Crawling each URL in parallel — sources finish independently.</p>
      <div className="flex flex-col gap-2.5 max-w-md mx-auto">
        {rows.map((row, i) => {
          const done = i < tickIndex;
          return (
            <div
              key={row.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left ${
                done ? "border-positive/50 bg-positive/[0.06]" : "border-border bg-card"
              }`}
            >
              {done ? (
                <span className="text-positive font-bold">✓</span>
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-accent animate-spin shrink-0" />
              )}
              <span className="truncate">
                {PLATFORM_LABELS[row.platform]} — {row.url}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function Dashboard({ report, onBack }: { report: BrandReport; onBack: () => void }) {
  const [filterPlatform, setFilterPlatform] = useState<Platform | "all">("all");
  const [filterSentiment, setFilterSentiment] = useState<"all" | Review["sentiment"]>("all");

  const filteredReviews = report.reviews.filter(
    (r) => (filterPlatform === "all" || r.platform === filterPlatform) && (filterSentiment === "all" || r.sentiment === filterSentiment)
  );

  function exportCsv() {
    const header = "platform,rating,sentiment,date,text,source_url\n";
    const rows = filteredReviews
      .map((r) =>
        [r.platform, r.rating ?? "", r.sentiment, r.date ?? "", `"${r.text.replace(/"/g, '""')}"`, r.sourceUrl].join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.brandName.replace(/\s+/g, "_")}_reviews.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const complaints = report.themes.filter((t) => t.kind === "complaint");
  const praises = report.themes.filter((t) => t.kind === "praise");

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <button onClick={onBack} className="text-sm text-text-dim hover:text-text mb-4">
        ← New analysis
      </button>

      {report.fromCache && (
        <div className="flex items-center gap-2 bg-neutral/[0.08] border border-neutral/35 text-neutral text-sm px-3.5 py-2.5 rounded-lg mb-5">
          ⚡ Loaded from cache — this brand was analyzed within the last 24h, so no sites were re-crawled.
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{report.brandName}</h1>
          <div className="text-sm text-text-dim mt-1">Generated {new Date(report.generatedAt).toLocaleString()}</div>
        </div>
      </div>

      <div className="flex items-center gap-8 bg-card border border-border rounded-2xl p-7 mb-6 flex-wrap">
        <ScoreGauge score={report.score} />
        <div>
          <h3 className="text-lg font-bold mb-1.5">{report.verdictTitle}</h3>
          <p className="text-sm text-text-dim max-w-lg">{report.verdictText}</p>
          <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full mt-2.5 bg-neutral/15 text-neutral">
            Composite across {report.sources.length} source{report.sources.length === 1 ? "" : "s"} — Gemini-generated verdict
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Aggregated Sentiment</h3>
          <div className="flex items-center gap-5 flex-wrap">
            <SentimentDonut pos={report.sentiment.pos} neu={report.sentiment.neu} neg={report.sentiment.neg} size={110} />
            <div className="flex flex-col gap-1.5 text-sm">
              <LegendRow color="var(--color-positive)" label={`Positive ${report.sentiment.pos}%`} />
              <LegendRow color="var(--color-neutral)" label={`Neutral ${report.sentiment.neu}%`} />
              <LegendRow color="var(--color-negative)" label={`Negative ${report.sentiment.neg}%`} />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Sources Crawled</h3>
          <div className="flex flex-col gap-2.5 max-h-56 overflow-y-auto pr-1">
            {report.sources.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm border-b border-border pb-2.5 last:border-none">
                <div className="min-w-0">
                  <div className="font-medium">{PLATFORM_LABELS[s.platform]}</div>
                  <div className="text-text-dim text-xs truncate max-w-[220px]">{s.url}</div>
                  {s.status !== "scraped" && s.reason && (
                    <div className="text-neutral text-[11px] mt-1 max-w-[260px]">{s.reason}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={s.status} />
                  <span className="text-xs text-text-dim">
                    {s.reviewsExtracted} reviews{s.avgRating ? ` · ★${s.avgRating.toFixed(1)}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Top Complaint Themes</h3>
          {complaints.length === 0 ? (
            <p className="text-sm text-text-dim">No recurring complaints surfaced.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {complaints.map((t, i) => (
                <ThemeRow key={i} theme={t} tone="negative" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Top Praise Themes</h3>
          {praises.length === 0 ? (
            <p className="text-sm text-text-dim">No recurring praise surfaced.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {praises.map((t, i) => (
                <ThemeRow key={i} theme={t} tone="positive" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 md:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h3 className="font-semibold">Raw Reviews ({filteredReviews.length})</h3>
            <div className="flex gap-2 items-center">
              <select
                className="text-xs bg-[#0d0f13] border border-border rounded-lg px-2 py-1.5"
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value as Platform | "all")}
              >
                <option value="all">All platforms</option>
                {report.platformBreakdown.map((p) => (
                  <option key={p.platform} value={p.platform}>
                    {PLATFORM_LABELS[p.platform]}
                  </option>
                ))}
              </select>
              <select
                className="text-xs bg-[#0d0f13] border border-border rounded-lg px-2 py-1.5"
                value={filterSentiment}
                onChange={(e) => setFilterSentiment(e.target.value as "all" | Review["sentiment"])}
              >
                <option value="all">All sentiment</option>
                <option value="pos">Positive</option>
                <option value="neu">Neutral</option>
                <option value="neg">Negative</option>
              </select>
              <button
                onClick={exportCsv}
                className="text-xs bg-accent hover:brightness-110 text-white font-semibold px-3 py-1.5 rounded-lg"
              >
                Export CSV
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-dim text-left uppercase text-[10px] tracking-wide border-b border-border">
                  <th className="py-2 pr-2">Platform</th>
                  <th className="py-2 pr-2">Rating</th>
                  <th className="py-2 pr-2">Sentiment</th>
                  <th className="py-2 pr-2">Text</th>
                </tr>
              </thead>
              <tbody>
                {filteredReviews.map((r, i) => (
                  <tr key={i} className="border-b border-border align-top">
                    <td className="py-2 pr-2 whitespace-nowrap">{PLATFORM_LABELS[r.platform]}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.rating ? `★${r.rating}` : "—"}</td>
                    <td className="py-2 pr-2">
                      <SentimentTag tag={r.sentiment} />
                    </td>
                    <td className="py-2 pr-2 text-text-dim max-w-md">{r.text.slice(0, 220)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <footer className="text-center text-text-dim text-xs mt-10 border-t border-border pt-5">
        &quot;Paste the URLs, get the aggregated reputation report — live where sites allow it, honestly labeled where they don&apos;t.&quot;
      </footer>
    </main>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </div>
  );
}

function StatusBadge({ status }: { status: "scraped" | "sample_fallback" | "failed" }) {
  if (status === "scraped") {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-positive/15 text-positive">Live (scraped)</span>;
  }
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral/15 text-neutral">Sample fallback</span>;
}

function SentimentTag({ tag }: { tag: Review["sentiment"] }) {
  const map = {
    pos: { label: "Positive", cls: "bg-positive/15 text-positive" },
    neu: { label: "Neutral", cls: "bg-neutral/15 text-neutral" },
    neg: { label: "Negative", cls: "bg-negative/15 text-negative" },
  } as const;
  const m = map[tag];
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}

function ThemeRow({ theme, tone }: { theme: BrandReport["themes"][number]; tone: "positive" | "negative" }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{theme.theme}</span>
        <span className="text-text-dim text-xs">{theme.count} mentions</span>
      </div>
      <p className={`text-xs mt-1 px-2.5 py-1.5 rounded-lg ${tone === "positive" ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
        &quot;{theme.example_snippet}&quot;
      </p>
    </div>
  );
}

function ScoreGauge({ score }: { score: number | null }) {
  const r = 68;
  const c = 2 * Math.PI * r;

  if (score === null) {
    return (
      <div className="relative w-40 h-40 shrink-0">
        <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
          <circle cx="80" cy="80" r={r} stroke="var(--color-border)" strokeWidth="14" fill="none" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-text-dim">N/A</div>
          <div className="text-[11px] text-text-dim uppercase tracking-wide">Health Score</div>
        </div>
      </div>
    );
  }

  const offset = c * (1 - score / 100);
  const color = score >= 78 ? "var(--color-positive)" : score >= 55 ? "var(--color-neutral)" : "var(--color-negative)";
  return (
    <div className="relative w-40 h-40 shrink-0">
      <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
        <circle cx="80" cy="80" r={r} stroke="var(--color-border)" strokeWidth="14" fill="none" />
        <circle
          cx="80"
          cy="80"
          r={r}
          stroke={color}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-bold">{score}</div>
        <div className="text-[11px] text-text-dim uppercase tracking-wide">Health Score</div>
      </div>
    </div>
  );
}

function SentimentDonut({ pos, neu, neg, size }: { pos: number; neu: number; neg: number; size: number }) {
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;
  const segments: { value: number; color: string }[] = [
    { value: pos, color: "var(--color-positive)" },
    { value: neu, color: "var(--color-neutral)" },
    { value: neg, color: "var(--color-negative)" },
  ];
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle cx={cx} cy={cy} r={r} stroke="var(--color-border)" strokeWidth="16" fill="none" />
      {segments.map((seg, i) => {
        if (seg.value <= 0) return null;
        const len = c * (seg.value / 100);
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            stroke={seg.color}
            strokeWidth="16"
            fill="none"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-acc}
          />
        );
        acc += len;
        return el;
      })}
    </svg>
  );
}
