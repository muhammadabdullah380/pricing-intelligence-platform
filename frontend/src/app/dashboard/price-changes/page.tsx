"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

const API = "/api/v1";

/* ---------- Types (backend response shape) ---------- */

type Store = {
  id: number;
  name: string;
  currency: string | null;
};

type PriceChange = {
  product_id: number;
  product_title: string;
  source: string;
  previous_price: number;
  new_price: number;
  delta: number;
  direction: string; // "increase" | "decrease"
  percent_change: number;
  observed_at: string;
};

type Money = (value: number | null | undefined) => string;
type SortKey = "observed_at" | "percent_change" | "product_title" | "source";
type SortDir = "asc" | "desc";

/* ---------- Helpers ---------- */

const SOURCE_LABELS: Record<string, string> = {
  amazon: "Amazon",
  walmart: "Walmart",
  bestbuy: "Best Buy",
  best_buy: "Best Buy",
};

function sourceLabel(source: string) {
  return SOURCE_LABELS[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

function parseDate(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

function formatDate(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

function Change({ delta, percent }: { delta: number; percent: number }) {
  if (delta === 0) return <span className="text-zinc-500">Unchanged</span>;
  const down = delta < 0;
  return (
    <span className={down ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}>
      {down ? "▼" : "▲"} {Math.abs(percent).toFixed(1)}%
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === activeKey;
  return (
    <th className={`whitespace-nowrap px-4 py-2 text-${align} text-xs font-medium text-zinc-500`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200 ${
          active ? "text-zinc-800 dark:text-zinc-200" : ""
        }`}
      >
        {label}
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

/* ---------- Page ---------- */

export default function PriceChangesPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [direction, setDirection] = useState<"" | "increase" | "decrease">("");
  const [sortKey, setSortKey] = useState<SortKey>("observed_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    try {
      const stores = await apiFetch<Store[]>(`${API}/stores`);
      setError(null);
      if (stores.length === 0) {
        setNoStore(true);
        return;
      }
      const s = stores[0];
      setStore(s);
      // NOTE: yeh endpoint poore store ke saare price changes ek sath deta hai
      // (koi pagination/filter param backend support nahi karta), is liye filtering
      // yahan frontend mein ki ja rahi hai. Bade catalog (jaise 5,000 products) ke
      // liye backend mein server-side filtering add karni hogi.
      const data = await apiFetch<PriceChange[]>(`${API}/stores/${s.id}/price-changes`);
      setChanges(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, []);

  function refresh() {
    setLoading(true);
    setError(null);
    load();
  }

  const competitors = useMemo(
    () => Array.from(new Set(changes.map((c) => c.source))).sort(),
    [changes],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = changes.filter((c) => {
      if (q && !c.product_title.toLowerCase().includes(q)) return false;
      if (competitor && c.source !== competitor) return false;
      if (direction && c.direction !== direction) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "observed_at":
          cmp = parseDate(a.observed_at).getTime() - parseDate(b.observed_at).getTime();
          break;
        case "percent_change":
          cmp = Math.abs(a.percent_change) - Math.abs(b.percent_change);
          break;
        case "product_title":
          cmp = a.product_title.localeCompare(b.product_title);
          break;
        case "source":
          cmp = a.source.localeCompare(b.source);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [changes, search, competitor, direction, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "observed_at" || key === "percent_change" ? "desc" : "asc");
    }
  }

  const money = useMemo(() => moneyFormatter(store?.currency ?? "USD"), [store?.currency]);
  const increases = changes.filter((c) => c.direction === "increase").length;
  const decreases = changes.filter((c) => c.direction === "decrease").length;

  if (noStore) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Price changes</h1>
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
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Price changes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {changes.length} recorded change{changes.length === 1 ? "" : "s"} — {increases} increase
            {increases === 1 ? "" : "s"}, {decreases} decrease{decreases === 1 ? "" : "s"}
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
          Price changes could not load: {error}
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
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "" | "increase" | "decrease")}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">Increases & decreases</option>
          <option value="decrease">Decreases only</option>
          <option value="increase">Increases only</option>
        </select>
        {(search || competitor || direction) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCompetitor("");
              setDirection("");
            }}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader label="Product" sortKey="product_title" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Competitor" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-zinc-500">Previous</th>
                <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-zinc-500">New</th>
                <SortHeader
                  label="Change"
                  sortKey="percent_change"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortHeader label="Seen" sortKey="observed_at" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading && changes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                    Loading price changes…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                    {changes.length === 0
                      ? "No price changes recorded yet. Run the pipeline a couple of times to start seeing changes."
                      : "No changes match these filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={`${c.product_id}-${c.source}-${c.observed_at}`}>
                    <td className="px-4 py-2 text-sm">
                      <Link
                        href={`/dashboard/products/${c.product_id}`}
                        className="font-medium text-zinc-900 hover:underline focus-visible:underline dark:text-zinc-100"
                      >
                        {c.product_title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {sourceLabel(c.source)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                      {money(c.previous_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                      {money(c.new_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm">
                      <Change delta={c.delta} percent={c.percent_change} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-zinc-400">
                      {formatDate(c.observed_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}