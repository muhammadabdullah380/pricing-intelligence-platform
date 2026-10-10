"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const API = "/api/v1";

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
  manufacturer: string | null;
  sku: string | null;
  category: string | null;
  model_number: string | null;
  url: string | null;
  image_url: string | null;
  list_price: number | null;
  currency: string | null;
  status: string;
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

type PriceHistoryPoint = {
  observed_at: string;
  price: number;
  currency: string;
  in_stock: boolean;
};

type PriceHistory = Record<string, PriceHistoryPoint[]>;

type PriceChange = {
  source: string;
  previous_price: number;
  new_price: number;
  delta: number;
  direction: string;
  percent_change: number;
  observed_at: string;
};

type Match = {
  id: number;
  product_id: number;
  source: string;
  external_id: string | null;
  external_title: string;
  external_brand: string | null;
  external_price: number;
  external_url: string | null;
  confidence_score: number;
  match_level: string;
  status: string;
};

type Money = (value: number | null | undefined) => string;

/* ---------- Helpers ---------- */

const SOURCE_LABELS: Record<string, string> = {
  amazon: "Amazon",
  walmart: "Walmart",
  bestbuy: "Best Buy",
  best_buy: "Best Buy",
};

const SOURCE_COLORS: Record<string, string> = {
  amazon: "#d97706", // amber-600
  walmart: "#2563eb", // blue-600
  bestbuy: "#9333ea", // purple-600
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

function formatDate(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

const POSITION_LABEL: Record<Position, string> = {
  cheapest: "Cheapest in market",
  below_market: "Below market",
  at_market: "At market",
  above_market: "Above market",
  most_expensive: "Most expensive in market",
  no_market_data: "No market data",
  no_own_price: "No price set",
};

const POSITION_CLASS: Record<Position, string> = {
  cheapest: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  below_market: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  at_market: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  above_market: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  most_expensive: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  no_market_data: "bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
  no_own_price: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

function PositionBadge({ position }: { position: Position | undefined }) {
  const p = position ?? "no_market_data";
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${POSITION_CLASS[p]}`}>
      {POSITION_LABEL[p]}
    </span>
  );
}

function buildRecommendation(pos: CompetitivePosition | null, money: Money): string | null {
  if (!pos || pos.our_price === null || pos.market_median === null) return null;
  const diffPct = ((pos.our_price - pos.market_median) / pos.market_median) * 100;
  if (Math.abs(diffPct) < 2) {
    return `Your price (${money(pos.our_price)}) is close to the median competitor price of ${money(pos.market_median)}. No action needed.`;
  }
  if (diffPct > 0) {
    return `Your price is currently ${diffPct.toFixed(1)}% above the median competitor price of ${money(pos.market_median)}. Review this product's pricing.`;
  }
  return `Your price is currently ${Math.abs(diffPct).toFixed(1)}% below the median competitor price of ${money(pos.market_median)}. You may be leaving margin on the table.`;
}

/* ---------- Price history chart (no external library, self-contained SVG) ---------- */

function PriceHistoryChart({
  history,
  ourPrice,
  money,
}: {
  history: PriceHistory;
  ourPrice: number | null;
  money: Money;
}) {
  const width = 680;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 28, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const sources = Object.keys(history).filter((s) => history[s].length > 0);

  const allPoints = sources.flatMap((s) =>
    history[s].map((p) => ({ source: s, time: parseDate(p.observed_at).getTime(), price: p.price })),
  );

  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (allPoints.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-zinc-500">
        No price history yet. Run the pipeline a couple of times to start building a trend.
      </p>
    );
  }

  const times = allPoints.map((p) => p.time);
  const prices = allPoints.map((p) => p.price).concat(ourPrice !== null ? [ourPrice] : []);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpan = maxPrice - minPrice || 1;
  const timeSpan = maxTime - minTime || 1;

  const x = (t: number) => padding.left + ((t - minTime) / timeSpan) * innerW;
  const y = (p: number) => padding.top + innerH - ((p - minPrice) / priceSpan) * innerH;

  const singlePointPerSource = sources.every((s) => history[s].length === 1) && sources.length > 0;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const time = minTime + ((px - padding.left) / innerW) * timeSpan;
    setHover({ x: Math.max(padding.left, Math.min(width - padding.right, px)), time });
  }

  // Nearest point (across all series) to the hovered time, for the tooltip
  const nearest = hover
    ? allPoints.reduce((best, p) => (Math.abs(p.time - hover.time) < Math.abs(best.time - hover.time) ? p : best))
    : null;

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => minPrice + (priceSpan * i) / yTicks);

  return (
    <div className="px-4 py-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Price history over time by competitor"
      >
        {/* Gridlines + y-axis labels */}
        {yTickValues.map((v) => (
          <g key={v}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              className="text-zinc-100 dark:text-zinc-800"
              strokeWidth={1}
            />
            <text x={padding.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-400 text-[10px]">
              {money(v)}
            </text>
          </g>
        ))}

        {/* X-axis labels: first and last timestamp */}
        <text x={padding.left} y={height - 6} className="fill-zinc-400 text-[10px]">
          {formatDateShort(new Date(minTime).toISOString())}
        </text>
        <text x={width - padding.right} y={height - 6} textAnchor="end" className="fill-zinc-400 text-[10px]">
          {formatDateShort(new Date(maxTime).toISOString())}
        </text>

        {/* Our price reference line */}
        {ourPrice !== null && (
          <>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(ourPrice)}
              y2={y(ourPrice)}
              stroke="#71717a"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
            <text x={width - padding.right} y={y(ourPrice) - 4} textAnchor="end" className="fill-zinc-500 text-[10px]">
              Your price
            </text>
          </>
        )}

        {/* One line (or dot, if only one observation) per competitor */}
        {sources.map((s) => {
          const pts = [...history[s]]
            .map((p) => ({ time: parseDate(p.observed_at).getTime(), price: p.price }))
            .sort((a, b) => a.time - b.time);
          const color = sourceColor(s);
          if (pts.length === 1 || singlePointPerSource) {
            return pts.map((p, i) => (
              <circle key={`${s}-${i}`} cx={x(p.time)} cy={y(p.price)} r={4} fill={color} />
            ));
          }
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.time)},${y(p.price)}`).join(" ");
          return (
            <g key={s}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} />
              {pts.map((p, i) => (
                <circle key={i} cx={x(p.time)} cy={y(p.price)} r={2.5} fill={color} />
              ))}
            </g>
          );
        })}

        {/* Hover guideline */}
        {hover && nearest && (
          <>
            <line
              x1={x(nearest.time)}
              x2={x(nearest.time)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="currentColor"
              className="text-zinc-300 dark:text-zinc-700"
              strokeWidth={1}
            />
            <circle cx={x(nearest.time)} cy={y(nearest.price)} r={5} fill={sourceColor(nearest.source)} stroke="white" strokeWidth={1.5} />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {nearest && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: sourceColor(nearest.source) }} />
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{sourceLabel(nearest.source)}</span>
          <span className="text-zinc-500">{money(nearest.price)}</span>
          <span className="text-zinc-400">{formatDate(new Date(nearest.time).toISOString())}</span>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {sources.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: sourceColor(s) }} />
            {sourceLabel(s)}
          </span>
        ))}
        {ourPrice !== null && (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="inline-block h-2 w-3 border-t-2 border-dashed border-zinc-500" />
            Your price
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- Matching panel ---------- */

function MatchRow({
  match,
  money,
  onDecide,
  deciding,
}: {
  match: Match;
  money: Money;
  onDecide: (id: number, status: "auto_matched" | "rejected") => void;
  deciding: boolean;
}) {
  const pct = Math.round(match.confidence_score * 100);
  const decided = match.status !== "pending_review";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="inline-block whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {sourceLabel(match.source)}
          </span>
          <span className="text-xs text-zinc-500">{match.match_level.replace(/_/g, " ")}</span>
        </div>
        <p className="mt-1 truncate text-sm text-zinc-800 dark:text-zinc-200" title={match.external_title}>
          {match.external_title}
        </p>
        <p className="text-xs text-zinc-500">
          {match.external_brand ? `${match.external_brand} · ` : ""}
          {money(match.external_price)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`whitespace-nowrap text-sm font-medium tabular-nums ${
            pct >= 95 ? "text-emerald-700 dark:text-emerald-400" : pct >= 80 ? "text-amber-700 dark:text-amber-400" : "text-zinc-500"
          }`}
        >
          {pct}%
        </span>
        {decided ? (
          <span className="whitespace-nowrap text-xs capitalize text-zinc-500">{match.status.replace(/_/g, " ")}</span>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={deciding}
              onClick={() => onDecide(match.id, "auto_matched")}
              className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={deciding}
              onClick={() => onDecide(match.id, "rejected")}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;

  const [store, setStore] = useState<Store | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [pos, setPos] = useState<CompetitivePosition | null>(null);
  const [history, setHistory] = useState<PriceHistory>({});
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    try {
      const stores = await apiFetch<Store[]>(`${API}/stores`);
      setError(null);
      if (stores.length === 0) {
        setError("No store found for your account yet.");
        return;
      }
      const s = stores[0];
      setStore(s);
      setLoading(true);

      const [productData, posData, historyData, changesData, pendingMatches] = await Promise.all([
        apiFetch<Product>(`${API}/stores/${s.id}/products/${productId}`),
        apiFetch<CompetitivePosition>(`${API}/stores/${s.id}/products/${productId}/competitive-position`).catch(
          () => null,
        ),
        apiFetch<PriceHistory>(`${API}/stores/${s.id}/products/${productId}/price-history`).catch(() => ({})),
        apiFetch<PriceChange[]>(`${API}/stores/${s.id}/products/${productId}/price-changes`).catch(() => []),
        apiFetch<Match[]>(`${API}/stores/${s.id}/matches/pending`).catch(() => []),
      ]);

      setProduct(productData);
      setPos(posData);
      setHistory(historyData);
      setChanges(changesData);
      setMatches(pendingMatches.filter((m) => m.product_id === Number(productId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this product");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const money = useMemo(() => moneyFormatter(store?.currency ?? product?.currency ?? "USD"), [store, product]);
  const recommendation = useMemo(() => buildRecommendation(pos, money), [pos, money]);

  async function runMatching() {
    if (!store || !productId) return;
    setMatching(true);
    setMatchError(null);
    try {
      const results = await apiFetch<Match[]>(`${API}/stores/${store.id}/products/${productId}/match`, {
        method: "POST",
      });
      // Server se jo naye matches aaye unhe merge karo, duplicate id avoid karte hue
      setMatches((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of results) byId.set(m.id, m);
        return Array.from(byId.values());
      });
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Matching failed");
    } finally {
      setMatching(false);
    }
  }

  async function decideMatch(matchId: number, status: "auto_matched" | "rejected") {
    if (!store) return;
    setDecidingId(matchId);
    try {
      const updated = await apiFetch<Match>(`${API}/stores/${store.id}/matches/${matchId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setMatches((prev) => prev.map((m) => (m.id === matchId ? updated : m)));
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Could not update this match");
    } finally {
      setDecidingId(null);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-zinc-500">Loading product…</div>;
  }

  if (error || !product) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/dashboard/products" className="text-sm text-zinc-500 hover:underline">
          ← Back to products
        </Link>
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {error ?? "This product could not be found."}
        </div>
      </div>
    );
  }

  const pending = matches.filter((m) => m.status === "pending_review");
  const decided = matches.filter((m) => m.status !== "pending_review");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <Link href="/dashboard/products" className="text-sm text-zinc-500 hover:underline">
        ← Back to products
      </Link>

      {/* Product info */}
      <div className="flex flex-wrap items-start gap-4">
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.title}
            className="h-20 w-20 flex-shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-800"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{product.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {[product.brand, product.model_number, product.sku, product.category].filter(Boolean).join(" · ")}
          </p>
        </div>
        {pos && <PositionBadge position={pos.position} />}
      </div>

      {/* Pricing summary */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-5 dark:border-zinc-800 dark:bg-zinc-800">
        {[
          { label: "Your price", value: pos?.our_price ?? product.list_price },
          { label: "Lowest competitor", value: pos?.market_min ?? null },
          { label: "Highest competitor", value: pos?.market_max ?? null },
          { label: "Market median", value: pos?.market_median ?? null },
          {
            label: "Price gap",
            value: null,
            custom:
              pos?.our_price !== null && pos?.our_price !== undefined && pos?.market_median
                ? money(pos.our_price - pos.market_median)
                : "–",
          },
        ].map((cell) => (
          <div key={cell.label} className="bg-white px-4 py-3 dark:bg-zinc-900">
            <dt className="text-xs text-zinc-500">{cell.label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {cell.custom ?? money(cell.value)}
            </dd>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      {recommendation && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <span className="font-medium">Recommendation: </span>
          {recommendation}
        </div>
      )}

      {/* Current competitor prices */}
      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Competitors</h2>
        </div>
        {pos && pos.competitors.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {pos.competitors.map((c) => (
              <div key={c.source} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{sourceLabel(c.source)}</span>
                <div className="flex items-center gap-3">
                  {!c.in_stock && <span className="text-xs text-zinc-400">Out of stock</span>}
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{money(c.price)}</span>
                  <span className="text-xs text-zinc-400">{formatDate(c.observed_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-zinc-500">
            No competitor prices yet. Run the pipeline to start collecting them.
          </p>
        )}
      </section>

      {/* Price history chart */}
      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Price history</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Hover the chart to see exact prices</p>
        </div>
        <PriceHistoryChart history={history} ourPrice={pos?.our_price ?? product.list_price} money={money} />
      </section>

      {/* Change history */}
      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Change history</h2>
        </div>
        {changes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No price changes recorded yet for this product.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {changes.map((c) => (
              <li key={`${c.source}-${c.observed_at}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-zinc-800 dark:text-zinc-200">
                  {sourceLabel(c.source)}{" "}
                  {c.delta === 0 ? (
                    <span className="text-zinc-500">unchanged</span>
                  ) : c.delta < 0 ? (
                    <span className="text-rose-700 dark:text-rose-400">
                      dropped {Math.abs(c.percent_change).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      increased {c.percent_change.toFixed(1)}%
                    </span>
                  )}
                </span>
                <span className="text-xs text-zinc-400">
                  {money(c.previous_price)} → {money(c.new_price)} · {formatDate(c.observed_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Matching */}
      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Product matching</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Candidate matches found on each competitor site, with a confidence score
            </p>
          </div>
          <button
            type="button"
            onClick={runMatching}
            disabled={matching}
            className="whitespace-nowrap rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {matching ? "Matching…" : "Run matching"}
          </button>
        </div>
        {matchError && (
          <p className="border-b border-zinc-100 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-zinc-800 dark:bg-amber-950 dark:text-amber-200">
            {matchError}
          </p>
        )}
        {pending.length === 0 && decided.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            No candidate matches yet. Click &quot;Run matching&quot; to search for this product on each
            competitor site.
          </p>
        ) : (
          <div>
            {pending
              .sort((a, b) => b.confidence_score - a.confidence_score)
              .map((m) => (
                <MatchRow key={m.id} match={m} money={money} onDecide={decideMatch} deciding={decidingId === m.id} />
              ))}
            {decided.map((m) => (
              <MatchRow key={m.id} match={m} money={money} onDecide={decideMatch} deciding={decidingId === m.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}