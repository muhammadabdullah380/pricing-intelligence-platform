"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

/*
 * API prefix: products page mein apiFetch ko jo path diya gaya hai, wohi prefix yahan rakho.
 * Agar wahan apiFetch("/api/v1/stores") hai to "/api/v1" rehne do.
 * Agar wahan apiFetch("/stores") hai to isay "" kar do.
 */
const API = "/api/v1";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const POSITION_CONCURRENCY = 6;
const UNDERCUT_THRESHOLD_PCT = 5;
const LIST_LIMIT = 8;
const RECENT_LIMIT = 10;

/* ---------- Types (backend response shapes) ---------- */

type Store = {
  id: number;
  name: string;
  currency: string | null;
};

type Product = {
  id: number;
  title: string;
  brand: string | null;
  sku: string | null;
  list_price: number | null;
  currency: string | null;
};

type Position =
  | "cheapest"
  | "below_market"
  | "at_market"
  | "above_market"
  | "most_expensive"
  | "no_market_data"
  | "no_own_price";

type CompetitorPrice = {
  source: string;
  price: number;
  in_stock: boolean;
  observed_at: string;
};

type CompetitivePosition = {
  our_price: number | null;
  competitors: CompetitorPrice[];
  market_median: number | null;
  market_min: number | null;
  market_max: number | null;
  position: Position;
};

type PriceChange = {
  product_id: number;
  product_title: string;
  source: string;
  previous_price: number;
  new_price: number;
  delta: number;
  direction: string;
  percent_change: number;
  observed_at: string;
};

type Row = {
  product: Product;
  pos: CompetitivePosition | null;
  gapPct: number | null;
};

type DashboardData = {
  store: Store;
  rows: Row[];
  changes: PriceChange[];
  failedPositions: number;
};

type Opportunity = {
  row: Row;
  ourPrice: number;
  cheapest: CompetitorPrice;
  undercutPct: number;
};

type SourceActivity = {
  source: string;
  drops: number;
  increases: number;
};

type Stats = {
  recentChanges: PriceChange[];
  productsWithChanges: number;
  drops: number;
  above: Row[];
  below: Row[];
  withMarketData: number;
  opportunities: Opportunity[];
  activity: SourceActivity[];
  lastChangeAt: string | null;
};

type Money = (value: number | null | undefined) => string;

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

function isAbove(position: Position | undefined) {
  return position === "above_market" || position === "most_expensive";
}

function isBelow(position: Position | undefined) {
  return position === "below_market" || position === "cheapest";
}

function parseDate(value: string) {
  // "2026-10-03 12:00:00" Safari mein parse nahi hota, is liye "T" lagate hain
  return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

function formatDate(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "–";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
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

/* ---------- Data loading ---------- */

async function loadProducts(storeId: number): Promise<Product[]> {
  // Pehli call bina "page" ke (backend ka default page), phir page=1,2,3...
  // Duplicates id se hata diye jate hain, is liye page 0 se shuru ho ya 1 se, dono chalega.
  const byId = new Map<number, Product>();
  const base = `${API}/stores/${storeId}/products?page_size=${PAGE_SIZE}`;

  const first = await apiFetch<Product[]>(base);
  first.forEach((p) => byId.set(p.id, p));

  let lastBatch = first.length;
  let page = 1;
  while (lastBatch === PAGE_SIZE && page <= MAX_PAGES) {
    const batch = await apiFetch<Product[]>(`${base}&page=${page}`);
    batch.forEach((p) => byId.set(p.id, p));
    lastBatch = batch.length;
    page += 1;
  }

  return Array.from(byId.values());
}

async function loadDashboard(): Promise<DashboardData | null> {
  const stores = await apiFetch<Store[]>(`${API}/stores`);
  if (stores.length === 0) return null;
  const store = stores[0];

  const [products, changes] = await Promise.all([
    loadProducts(store.id),
    apiFetch<PriceChange[]>(`${API}/stores/${store.id}/price-changes`),
  ]);

  let failedPositions = 0;
  const positions = await mapLimit(products, POSITION_CONCURRENCY, async (product) => {
    try {
      return await apiFetch<CompetitivePosition>(
        `${API}/stores/${store.id}/products/${product.id}/competitive-position`,
      );
    } catch {
      failedPositions += 1;
      return null;
    }
  });

  const rows: Row[] = products.map((product, index) => {
    const pos = positions[index];
    const gapPct =
      pos && pos.our_price !== null && pos.market_median
        ? ((pos.our_price - pos.market_median) / pos.market_median) * 100
        : null;
    return { product, pos, gapPct };
  });

  return { store, rows, changes, failedPositions };
}

function computeStats({ rows, changes }: DashboardData): Stats {
  const moved = changes
    .filter((c) => c.delta !== 0)
    .sort((a, b) => parseDate(b.observed_at).getTime() - parseDate(a.observed_at).getTime());

  const above = rows
    .filter((r) => isAbove(r.pos?.position))
    .sort((a, b) => (b.gapPct ?? 0) - (a.gapPct ?? 0));

  const below = rows
    .filter((r) => isBelow(r.pos?.position))
    .sort((a, b) => (a.gapPct ?? 0) - (b.gapPct ?? 0));

  // Undercut: sab se sasta in-stock competitor, hamari price se kitna % neeche hai
  const opportunities: Opportunity[] = [];
  for (const row of rows) {
    const ourPrice = row.pos?.our_price ?? null;
    const inStock = (row.pos?.competitors ?? []).filter((c) => c.in_stock);
    if (ourPrice === null || ourPrice <= 0 || inStock.length === 0) continue;
    const cheapest = inStock.reduce((min, c) => (c.price < min.price ? c : min));
    const undercutPct = ((ourPrice - cheapest.price) / ourPrice) * 100;
    if (undercutPct >= UNDERCUT_THRESHOLD_PCT) {
      opportunities.push({ row, ourPrice, cheapest, undercutPct });
    }
  }
  opportunities.sort((a, b) => b.undercutPct - a.undercutPct);

  const bySource = new Map<string, SourceActivity>();
  for (const c of moved) {
    const entry = bySource.get(c.source) ?? { source: c.source, drops: 0, increases: 0 };
    if (c.delta < 0) entry.drops += 1;
    else entry.increases += 1;
    bySource.set(c.source, entry);
  }
  const activity = Array.from(bySource.values()).sort(
    (a, b) => b.drops + b.increases - (a.drops + a.increases),
  );

  return {
    recentChanges: moved,
    productsWithChanges: new Set(moved.map((c) => c.product_id)).size,
    drops: moved.filter((c) => c.delta < 0).length,
    above,
    below,
    withMarketData: rows.filter((r) => (r.pos?.competitors.length ?? 0) > 0).length,
    opportunities,
    activity,
    lastChangeAt: moved[0]?.observed_at ?? null,
  };
}

/* ---------- Small UI pieces ---------- */

const TH = "whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-zinc-500";
const TH_NUM = "whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-zinc-500";
const TD = "px-4 py-2 text-sm text-zinc-800 dark:text-zinc-200";
const TD_NUM = "whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200";
const TD_NUM_MUTED = "whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-zinc-500";
const TBODY = "divide-y divide-zinc-100 dark:divide-zinc-800";
const THEAD = "border-b border-zinc-200 dark:border-zinc-800";

function Kpi({
  label,
  value,
  note,
  className = "",
}: {
  label: string;
  value: number;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`bg-white px-4 py-4 dark:bg-zinc-900 ${className}`}>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value.toLocaleString("en-US")}
      </dd>
      {note && <dd className="mt-1 text-xs text-zinc-500">{note}</dd>}
    </div>
  );
}

function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-sm text-zinc-500">{children}</p>;
}

function ProductLink({ id, title }: { id: number; title: string }) {
  return (
    <Link
      href={`/dashboard/products/${id}`}
      title={title}
      className="block max-w-[18rem] truncate font-medium text-zinc-900 hover:underline focus-visible:underline dark:text-zinc-100"
    >
      {title}
    </Link>
  );
}

function Change({ delta, percent }: { delta: number; percent: number }) {
  const down = delta < 0;
  return (
    <span className={down ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}>
      {down ? "▼" : "▲"} {Math.abs(percent).toFixed(1)}%
    </span>
  );
}

function MarketTable({ rows, money, empty }: { rows: Row[]; money: Money; empty: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead className={THEAD}>
          <tr>
            <th className={TH}>Product</th>
            <th className={TH_NUM}>Your price</th>
            <th className={TH_NUM}>Market median</th>
            <th className={TH_NUM}>Gap</th>
          </tr>
        </thead>
        <tbody className={TBODY}>
          {rows.slice(0, LIST_LIMIT).map((r) => (
            <tr key={r.product.id}>
              <td className={TD}>
                <ProductLink id={r.product.id} title={r.product.title} />
              </td>
              <td className={TD_NUM}>{money(r.pos?.our_price)}</td>
              <td className={TD_NUM}>{money(r.pos?.market_median)}</td>
              <td className={TD_NUM}>{formatPct(r.gapPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > LIST_LIMIT && (
        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
          Showing {LIST_LIMIT} of {rows.length}
        </p>
      )}
    </div>
  );
}

/* ---------- Page ---------- */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await loadDashboard();
      setError(null);
      setNoStore(result === null);
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

  const stats = useMemo(() => (data ? computeStats(data) : null), [data]);

  if (loading && !data && !noStore && !error) {
    return <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-zinc-500">Loading pricing data…</div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          <p>The dashboard could not load: {error}</p>
          <button type="button" onClick={load} className="mt-2 font-medium underline underline-offset-2">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (noStore) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Overview</h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          This account has no store yet. Create a store, import your product catalog, then run the
          pipeline to start collecting competitor prices.
        </p>
      </div>
    );
  }

  if (!data || !stats) return null;

  const money = moneyFormatter(data.store.currency ?? "USD");
  const maxActivity = Math.max(1, ...stats.activity.map((a) => a.drops + a.increases));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{data.store.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {stats.lastChangeAt
              ? `Latest competitor price change: ${formatDate(stats.lastChangeAt)}`
              : "No competitor price changes recorded yet"}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {loading ? "Refreshing…" : "Refresh data"}
        </button>
      </header>

      {data.failedPositions > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Market position could not be loaded for {data.failedPositions} product
          {data.failedPositions === 1 ? "" : "s"}. They are left out of the market counts below.
        </p>
      )}

      {/* KPI strip */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-5 dark:border-zinc-800 dark:bg-zinc-800">
        <Kpi
          label="Tracked products"
          value={data.rows.length}
          note={`${stats.withMarketData} with competitor prices`}
          className="col-span-2 md:col-span-1"
        />
        <Kpi
          label="Products with price changes"
          value={stats.productsWithChanges}
          note="Since the previous price check"
        />
        <Kpi label="Above market" value={stats.above.length} note="More than 5% above median" />
        <Kpi label="Below market" value={stats.below.length} note="More than 5% below median" />
        <Kpi label="Competitor price drops" value={stats.drops} note="Across all competitors" />
      </dl>

      {/* Recent changes + competitor activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Recent competitor price changes"
          description="Each competitor's latest price compared with its previous check, newest first"
          className="lg:col-span-2"
        >
          {stats.recentChanges.length === 0 ? (
            <Empty>
              No price changes yet. Changes appear after the pipeline has checked prices at least twice.
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Product</th>
                    <th className={TH}>Competitor</th>
                    <th className={TH_NUM}>Previous</th>
                    <th className={TH_NUM}>New</th>
                    <th className={TH_NUM}>Change</th>
                    <th className={TH_NUM}>Seen</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {stats.recentChanges.slice(0, RECENT_LIMIT).map((c) => (
                    <tr key={`${c.product_id}-${c.source}-${c.observed_at}`}>
                      <td className={TD}>
                        <ProductLink id={c.product_id} title={c.product_title} />
                      </td>
                      <td className={TD}>{sourceLabel(c.source)}</td>
                      <td className={TD_NUM}>{money(c.previous_price)}</td>
                      <td className={TD_NUM}>{money(c.new_price)}</td>
                      <td className={TD_NUM}>
                        <Change delta={c.delta} percent={c.percent_change} />
                      </td>
                      <td className={TD_NUM_MUTED}>{formatDate(c.observed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Competitor activity" description="Price changes per competitor in the latest check">
          {stats.activity.length === 0 ? (
            <Empty>No competitor has changed a price yet.</Empty>
          ) : (
            <ul className="space-y-4 px-4 py-4">
              {stats.activity.map((a) => {
                const total = a.drops + a.increases;
                return (
                  <li key={a.source}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {sourceLabel(a.source)}
                      </span>
                      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                        {total} change{total === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 flex h-2 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800"
                      aria-hidden="true"
                    >
                      <div className="bg-rose-500" style={{ width: `${(a.drops / maxActivity) * 100}%` }} />
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${(a.increases / maxActivity) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-zinc-500">
                      {a.drops} drop{a.drops === 1 ? "" : "s"}, {a.increases} increase
                      {a.increases === 1 ? "" : "s"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Opportunities */}
      <Panel
        title="Products to review"
        description={`An in-stock competitor is at least ${UNDERCUT_THRESHOLD_PCT}% cheaper than your price`}
      >
        {stats.opportunities.length === 0 ? (
          <Empty>No competitor is significantly undercutting your prices right now.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Product</th>
                  <th className={TH_NUM}>Your price</th>
                  <th className={TH}>Cheapest competitor</th>
                  <th className={TH_NUM}>Their price</th>
                  <th className={TH_NUM}>Cheaper by</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {stats.opportunities.slice(0, RECENT_LIMIT).map((o) => (
                  <tr key={o.row.product.id}>
                    <td className={TD}>
                      <ProductLink id={o.row.product.id} title={o.row.product.title} />
                    </td>
                    <td className={TD_NUM}>{money(o.ourPrice)}</td>
                    <td className={TD}>{sourceLabel(o.cheapest.source)}</td>
                    <td className={TD_NUM}>{money(o.cheapest.price)}</td>
                    <td className={`${TD_NUM}`}>
                      <span className="text-rose-700 dark:text-rose-400">{o.undercutPct.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.opportunities.length > RECENT_LIMIT && (
              <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
                Showing {RECENT_LIMIT} of {stats.opportunities.length}
              </p>
            )}
          </div>
        )}
      </Panel>

      {/* Above / below market */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Above market" description="Your price is more than 5% above the competitor median">
          <MarketTable rows={stats.above} money={money} empty="No products are priced above market." />
        </Panel>
        <Panel title="Below market" description="Your price is more than 5% below the competitor median">
          <MarketTable rows={stats.below} money={money} empty="No products are priced below market." />
        </Panel>
      </div>
    </div>
  );
}
