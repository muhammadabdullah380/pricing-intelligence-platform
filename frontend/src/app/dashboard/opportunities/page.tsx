"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

const API = "/api/v1";

/* ---------- Types (backend response shape) ---------- */

type Store = {
  id: number;
  name: string;
  currency: string | null;
};

type OpportunityType = "price_too_high" | "price_too_low";

type Opportunity = {
  product_id: number;
  product_title: string;
  opportunity_type: OpportunityType;
  our_price: number;
  market_median: number;
  diff_pct: number;
  currency: string;
};

type Money = (value: number | null | undefined) => string;

/* ---------- Helpers ---------- */

function moneyFormatter(currency: string): Money {
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("en-US", { style: "currency", currency });
  } catch {
    fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  }
  return (value) => (value === null || value === undefined ? "–" : fmt.format(value));
}

function TypeBadge({ type }: { type: OpportunityType }) {
  if (type === "price_too_high") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-300">
        Priced too high
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      Priced too low
    </span>
  );
}

function recommendation(o: Opportunity, money: Money): string {
  if (o.opportunity_type === "price_too_high") {
    return `Your price (${money(o.our_price)}) is ${Math.abs(o.diff_pct).toFixed(1)}% above the median competitor price of ${money(o.market_median)}. You may be losing sales to cheaper competitors — consider lowering the price.`;
  }
  return `Your price (${money(o.our_price)}) is ${Math.abs(o.diff_pct).toFixed(1)}% below the median competitor price of ${money(o.market_median)}. You may be leaving margin on the table — consider raising the price.`;
}

/* ---------- Page ---------- */

export default function OpportunitiesPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | OpportunityType>("");

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
      const data = await apiFetch<Opportunity[]>(`${API}/stores/${s.id}/opportunities`);
      setOpportunities(data);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter((o) => {
      if (typeFilter && o.opportunity_type !== typeFilter) return false;
      if (q && !o.product_title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [opportunities, search, typeFilter]);

  const money = useMemo(() => moneyFormatter(store?.currency ?? "USD"), [store?.currency]);
  const tooHigh = opportunities.filter((o) => o.opportunity_type === "price_too_high").length;
  const tooLow = opportunities.filter((o) => o.opportunity_type === "price_too_low").length;

  if (noStore) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Opportunities</h1>
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
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Opportunities</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {opportunities.length} product{opportunities.length === 1 ? "" : "s"} at least 5% away from the market
            median — {tooHigh} priced too high, {tooLow} priced too low
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
          Opportunities could not load: {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name…"
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "" | OpportunityType)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All opportunities</option>
          <option value="price_too_high">Priced too high</option>
          <option value="price_too_low">Priced too low</option>
        </select>
        {(search || typeFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setTypeFilter("");
            }}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      {loading && opportunities.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          Loading opportunities…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          {opportunities.length === 0
            ? "No pricing opportunities right now — every product is close to the market median."
            : "No opportunities match these filters."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div
              key={o.product_id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/products/${o.product_id}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {o.product_title}
                    </Link>
                    <TypeBadge type={o.opportunity_type} />
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{recommendation(o, money)}</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                    <span>
                      Your price: <span className="font-medium">{money(o.our_price)}</span>
                    </span>
                    <span>
                      Market median: <span className="font-medium">{money(o.market_median)}</span>
                    </span>
                    <span
                      className={
                        o.opportunity_type === "price_too_high"
                          ? "font-medium text-rose-700 dark:text-rose-400"
                          : "font-medium text-amber-700 dark:text-amber-400"
                      }
                    >
                      {o.diff_pct > 0 ? "▲" : "▼"} {Math.abs(o.diff_pct).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <Link
                  href={`/dashboard/products/${o.product_id}`}
                  className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  View product
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
