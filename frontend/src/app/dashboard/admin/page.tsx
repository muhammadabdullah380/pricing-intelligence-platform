"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const API = "/api/v1";

/* ---------- Types (backend response shape) ---------- */

type Store = {
  id: number;
  name: string;
  currency: string | null;
};

type DataQuality = {
  total_products: number;
  products_missing_market_data: number;
  pending_matches: number;
  per_source_last_check: Record<string, string | null>;
};

/* ---------- Helpers ---------- */

const SOURCE_LABELS: Record<string, string> = {
  amazon: "Amazon",
  walmart: "Walmart",
  bestbuy: "Best Buy",
};

function sourceLabel(source: string) {
  return SOURCE_LABELS[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

function parseDate(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function hoursSince(value: string | null): number | null {
  if (!value) return null;
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function HealthDot({ hours }: { hours: number | null }) {
  let color = "bg-zinc-400"; // no data
  if (hours !== null) {
    if (hours <= 24) color = "bg-emerald-500";
    else if (hours <= 72) color = "bg-amber-500";
    else color = "bg-rose-500";
  }
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

/* ---------- Page ---------- */

export default function AdminPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [data, setData] = useState<DataQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const result = await apiFetch<DataQuality>(`${API}/stores/${s.id}/data-quality`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) load();
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
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Admin</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This account has no store yet. Create a store and import your product catalog first.
        </p>
      </div>
    );
  }

  const sources = data ? Object.keys(data.per_source_last_check) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Admin</h1>
          <p className="mt-1 text-sm text-zinc-500">Data quality and connector freshness for {store?.name}</p>
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
          Admin data could not load: {error}
        </div>
      )}

      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : data ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Total products" value={data.total_products} />
            <StatCard
              label="Missing market data"
              value={data.products_missing_market_data}
              sub={
                data.total_products > 0
                  ? `${((data.products_missing_market_data / data.total_products) * 100).toFixed(0)}% of catalog`
                  : undefined
              }
            />
            <StatCard label="Matches pending review" value={data.pending_matches} />
          </div>

          {/* Connector health */}
          <div>
            <h2 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Connector freshness</h2>
            <p className="mb-3 text-xs text-zinc-400">
              Based on the most recent price check seen from each source. Green = checked in the last 24h, amber =
              1–3 days, red = over 3 days or never.
            </p>
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {sources.map((source) => {
                const lastCheck = data.per_source_last_check[source];
                const hours = hoursSince(lastCheck);
                return (
                  <div key={source} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <HealthDot hours={hours} />
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{sourceLabel(source)}</span>
                    </div>
                    <span className="text-xs text-zinc-400">
                      {lastCheck ? `Last checked ${formatDate(lastCheck)}` : "No data yet"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-zinc-400">
            Note: this is a lightweight data-quality view built from existing price data. Full pipeline-run history
            and per-connector error logs aren&apos;t tracked yet — that would need a dedicated run-history table and
            structured logging, which is a larger piece of future work.
          </p>
        </>
      ) : null}
    </div>
  );
}
