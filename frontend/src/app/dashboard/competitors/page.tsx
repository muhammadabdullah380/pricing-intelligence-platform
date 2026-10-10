"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const API = "/api/v1";

/* ---------- Types (backend response shape) ---------- */

type CompetitorSummary = {
  source: string;
  matched_products: number;
  avg_price_diff_pct: number | null;
  cheaper_products: number;
  more_expensive_products: number;
  price_increases: number;
  price_decreases: number;
  last_seen: string | null;
};

/* ---------- Helpers ---------- */

const SOURCE_LABELS: Record<string, string> = {
  amazon: "Amazon",
  walmart: "Walmart",
  bestbuy: "Best Buy",
  best_buy: "Best Buy",
};

const SOURCE_COLORS: Record<string, string> = {
  amazon: "#d97706",
  walmart: "#2563eb",
  bestbuy: "#9333ea",
  best_buy: "#9333ea",
};

function sourceLabel(source: string) {
  return SOURCE_LABELS[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

function sourceColor(source: string) {
  return SOURCE_COLORS[source.toLowerCase()] ?? "#71717a";
}

function parseDate(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

function formatDate(value: string | null) {
  if (!value) return "No data yet";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DiffBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-sm text-zinc-500">–</span>;
  }
  const higher = pct > 0;
  return (
    <span className={higher ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}>
      {higher ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% {higher ? "above you" : "below you"}
    </span>
  );
}

/* ---------- Page ---------- */

export default function CompetitorsPage() {
  const [noStore, setNoStore] = useState(false);
  const [competitors, setCompetitors] = useState<CompetitorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const stores = await apiFetch<{ id: number }[]>(`${API}/stores`);
      setError(null);
      if (stores.length === 0) {
        setNoStore(true);
        return;
      }
      const s = stores[0];
      const data = await apiFetch<CompetitorSummary[]>(`${API}/stores/${s.id}/competitors`);
      setCompetitors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  function refresh() {
    setLoading(true);
    setError(null);
    load();
  }

  if (noStore) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Competitors</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This account has no store yet. Create a store and import your product catalog first.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Competitors</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {competitors.length} competitor{competitors.length === 1 ? "" : "s"} tracked across your catalog
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          Competitors could not load: {error}
        </div>
      )}

      {loading && competitors.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          Loading competitors…
        </div>
      ) : competitors.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          No competitor data yet. Confirm some matches in the Review Queue and run the pipeline to start seeing
          activity here.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c) => {
            const totalDirectional = c.price_increases + c.price_decreases;
            const increasePct = totalDirectional > 0 ? (c.price_increases / totalDirectional) * 100 : 0;
            return (
              <div
                key={c.source}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: sourceColor(c.source) }}
                  />
                  <h2 className="font-medium text-zinc-900 dark:text-zinc-100">{sourceLabel(c.source)}</h2>
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Matched products</dt>
                    <dd className="font-medium text-zinc-800 dark:text-zinc-200">{c.matched_products}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Avg. price vs. you</dt>
                    <dd>
                      <DiffBadge pct={c.avg_price_diff_pct} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Cheaper than you</dt>
                    <dd className="font-medium text-emerald-700 dark:text-emerald-400">{c.cheaper_products}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">More expensive</dt>
                    <dd className="font-medium text-rose-700 dark:text-rose-400">{c.more_expensive_products}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Last seen</dt>
                    <dd className="text-xs text-zinc-400">{formatDate(c.last_seen)}</dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{c.price_decreases} drops</span>
                    <span>{c.price_increases} increases</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    {totalDirectional > 0 && (
                      <div className="flex h-full w-full">
                        <div className="h-full bg-rose-500" style={{ width: `${100 - increasePct}%` }} />
                        <div className="h-full bg-emerald-500" style={{ width: `${increasePct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
