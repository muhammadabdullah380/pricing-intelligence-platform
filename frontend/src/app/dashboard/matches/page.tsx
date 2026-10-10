"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

const API = "/api/v1";
const PRODUCT_LOOKUP_CONCURRENCY = 6;

/* ---------- Types (backend response shapes) ---------- */

type Store = {
  id: number;
  name: string;
  currency: string | null;
};

type Match = {
  id: number;
  product_id: number;
  source: string;
  external_id: string | null;
  external_title: string;
  external_brand: string | null;
  external_price: number | null;
  external_url: string | null;
  confidence_score: number;
  match_level: string;
  status: string;
};

type Product = {
  id: number;
  title: string;
  brand: string | null;
  list_price: number | null;
  currency: string | null;
};

type Money = (value: number | null | undefined) => string;

/* ---------- Helpers ---------- */

const SOURCE_LABELS: Record<string, string> = {
  amazon: "Amazon",
  walmart: "Walmart",
  bestbuy: "Best Buy",
  best_buy: "Best Buy",
};

const MATCH_LEVEL_LABELS: Record<string, string> = {
  identifier: "Identifier match",
  brand_model: "Brand + model match",
  normalized_title: "Title match",
  attributes: "Attribute match",
  similarity: "Similarity score",
};

function sourceLabel(source: string) {
  return SOURCE_LABELS[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

function matchLevelLabel(level: string) {
  return MATCH_LEVEL_LABELS[level] ?? level;
}

function moneyFormatter(currency: string): Money {
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("en-US", { style: "currency", currency });
  } catch {
    fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  }
  return (value) => (value === null || value === undefined ? "–" : fmt.format(value));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  let classes = "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  if (pct >= 90) classes = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  else if (pct >= 80) classes = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  else classes = "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>{pct}%</span>;
}

/* ---------- Page ---------- */

export default function MatchesPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [products, setProducts] = useState<Record<number, Product>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [competitor, setCompetitor] = useState("");

  const load = useCallback(async () => {
    try {
      const stores = await apiFetch<Store[]>(`${API}/stores`);
      setError(null);
      if (stores.length === 0) {
        setNoStore(true);
        return;
      }
      const s = stores[0];
      setStore(s);

      const pending = await apiFetch<Match[]>(`${API}/stores/${s.id}/matches/pending`);
      setMatches(pending);

      // Match object mein product ka naam nahi aata, sirf product_id — is liye
      // har unique product_id ke liye naam alag se fetch kar rahe hain.
      const uniqueIds = Array.from(new Set(pending.map((m) => m.product_id)));
      const fetched = await mapLimit(uniqueIds, PRODUCT_LOOKUP_CONCURRENCY, async (id) => {
        try {
          return await apiFetch<Product>(`${API}/stores/${s.id}/products/${id}`);
        } catch {
          return null;
        }
      });
      const byId: Record<number, Product> = {};
      fetched.forEach((p) => {
        if (p) byId[p.id] = p;
      });
      setProducts(byId);
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

  async function decide(matchId: number, status: "auto_matched" | "rejected") {
    if (!store) return;
    setDecidingId(matchId);
    setDecideError(null);
    try {
      await apiFetch<Match>(`${API}/stores/${store.id}/matches/${matchId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      // Faisla ho gaya to list se hata do — yeh ab "pending" nahi raha
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (err) {
      setDecideError(err instanceof Error ? err.message : "Could not update this match");
    } finally {
      setDecidingId(null);
    }
  }

  const competitors = useMemo(() => Array.from(new Set(matches.map((m) => m.source))).sort(), [matches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matches.filter((m) => {
      if (competitor && m.source !== competitor) return false;
      if (!q) return true;
      const productTitle = products[m.product_id]?.title.toLowerCase() ?? "";
      return productTitle.includes(q) || m.external_title.toLowerCase().includes(q);
    });
  }, [matches, search, competitor, products]);

  const money = useMemo(() => moneyFormatter(store?.currency ?? "USD"), [store?.currency]);

  if (noStore) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Review queue</h1>
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
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Review queue</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {matches.length} match{matches.length === 1 ? "" : "es"} waiting for review (confidence between 80% and
            95% — below 80% is not matched automatically, above 95% is auto-confirmed)
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
          Review queue could not load: {error}
        </div>
      )}
      {decideError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {decideError}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product or listing title…"
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={competitor}
          onChange={(e) => setCompetitor(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All competitors</option>
          {competitors.map((c) => (
            <option key={c} value={c}>
              {sourceLabel(c)}
            </option>
          ))}
        </select>
        {(search || competitor) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCompetitor("");
            }}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Cards */}
      {loading && matches.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          Loading review queue…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          {matches.length === 0
            ? "Nothing waiting for review right now. Run matching from a product's page to find new candidates."
            : "No matches found for these filters."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const product = products[m.product_id];
            const deciding = decidingId === m.id;
            return (
              <div
                key={m.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {product ? (
                        <Link
                          href={`/dashboard/products/${m.product_id}`}
                          className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                        >
                          {product.title}
                        </Link>
                      ) : (
                        <span className="text-zinc-500">Product #{m.product_id}</span>
                      )}
                      <span className="text-zinc-400">↔</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {sourceLabel(m.source)}
                      </span>
                      <ConfidenceBadge score={m.confidence_score} />
                      <span className="text-xs text-zinc-400">{matchLevelLabel(m.match_level)}</span>
                    </div>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {m.external_url ? (
                        <a
                          href={m.external_url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {m.external_title}
                        </a>
                      ) : (
                        m.external_title
                      )}
                      {m.external_brand && <span className="text-zinc-400"> · {m.external_brand}</span>}
                    </p>

                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                      <span>
                        Your price:{" "}
                        <span className="font-medium">{money(product?.list_price ?? null)}</span>
                      </span>
                      <span>
                        Their price: <span className="font-medium">{money(m.external_price)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => decide(m.id, "auto_matched")}
                      disabled={deciding}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {deciding ? "…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(m.id, "rejected")}
                      disabled={deciding}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {deciding ? "…" : "Reject"}
                    </button>
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
