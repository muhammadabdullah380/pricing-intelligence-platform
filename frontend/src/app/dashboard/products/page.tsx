"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

/*
 * Pichli products/page.tsx ki tarah API prefix. Agar dashboard overview
 * (/dashboard/page.tsx) mein API="" kiya tha, yahan bhi API="" kar dena.
 */
const API = "/api/v1";

const PAGE_SIZE = 25;
const POSITION_CONCURRENCY = 6;
const SEARCH_DEBOUNCE_MS = 350;
const CATEGORY_SAMPLE_SIZE = 100;

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
  category: string | null;
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

type Row = {
  product: Product;
  pos: CompetitivePosition | null;
};

type Money = (value: number | null | undefined) => string;

/* ---------- Helpers ---------- */

// Hum sirf teen competitors track karte hain, is liye columns fixed hain
const COMPETITOR_SOURCES: { key: string; label: string }[] = [
  { key: "amazon", label: "Amazon" },
  { key: "walmart", label: "Walmart" },
  { key: "bestbuy", label: "Best Buy" },
];

function findCompetitorPrice(pos: CompetitivePosition | null, source: string): CompetitorPrice | null {
  if (!pos) return null;
  return pos.competitors.find((c) => c.source.toLowerCase().replace("_", "") === source) ?? null;
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
  cheapest: "Cheapest",
  below_market: "Below market",
  at_market: "At market",
  above_market: "Above market",
  most_expensive: "Most expensive",
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
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${POSITION_CLASS[p]}`}>
      {POSITION_LABEL[p]}
    </span>
  );
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

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/* ---------- Page ---------- */

export default function ProductsPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Store ek dafa load karo
  useEffect(() => {
    (async () => {
      try {
        const stores = await apiFetch<Store[]>(`${API}/stores`);
        if (stores.length === 0) {
          setNoStore(true);
        } else {
          setStore(stores[0]);
        }
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "Unknown error");
      }
    })();
  }, []);

  // Category dropdown: ek chhota sample fetch kar ke distinct categories nikalo.
  // NOTE: yeh sirf pehle 100 products dekhta hai, is liye bade catalog (jaise
  // 5,000 products) mein kuch categories dropdown mein miss ho sakti hain.
  // Poori list ke liye backend mein ek dedicated "distinct categories" endpoint chahiye.
  useEffect(() => {
    if (!store) return;
    (async () => {
      try {
        const sample = await apiFetch<Product[]>(
          `${API}/stores/${store.id}/products?page_size=${CATEGORY_SAMPLE_SIZE}`,
        );
        const unique = Array.from(new Set(sample.map((p) => p.category).filter((c): c is string => !!c)));
        unique.sort((a, b) => a.localeCompare(b));
        setCategories(unique);
      } catch {
        // Category list optional hai, chup chap skip karo
      }
    })();
  }, [store]);

  const loadPage = useCallback(async () => {
    if (!store) return;
    try {
      const params = new URLSearchParams();
      params.set("page_size", String(PAGE_SIZE));
      params.set("page", String(page));
      if (search.trim()) params.set("q", search.trim());
      if (category) params.set("category", category);

      const products = await apiFetch<Product[]>(`${API}/stores/${store.id}/products?${params.toString()}`);
      setHasNextPage(products.length === PAGE_SIZE);

      let failed = 0;
      const positions = await mapLimit(products, POSITION_CONCURRENCY, async (product) => {
        try {
          return await apiFetch<CompetitivePosition>(
            `${API}/stores/${store.id}/products/${product.id}/competitive-position`,
          );
        } catch {
          failed += 1;
          return null;
        }
      });
      if (failed > 0) {
        setLoadError(`Market position could not be loaded for ${failed} product${failed === 1 ? "" : "s"}.`);
      }

      setRows(products.map((product, i) => ({ product, pos: positions[i] })));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unknown error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [store, page, search, category]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadPage();
    });
    return () => {
      active = false;
    };
  }, [loadPage]);

  const money = useMemo(() => moneyFormatter(store?.currency ?? "USD"), [store?.currency]);

  function updateSearch(value: string) {
    setSearchInput(value);
    setPage(1);
    setLoading(true);
    setLoadError(null);
  }

  function updateCategory(value: string) {
    setCategory(value);
    setPage(1);
    setLoading(true);
    setLoadError(null);
  }

  if (storeError) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          Products could not load: {storeError}
        </div>
      </div>
    );
  }

  if (noStore) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Products</h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          This account has no store yet. Create a store and import your product catalog to see products
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-8">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Products</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {store ? `${store.name} — tracked products and how they compare with competitors` : "Loading…"}
        </p>
      </header>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder="Search by name, SKU, brand, model, UPC…"
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={category}
          onChange={(e) => updateCategory(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {(search || category) && (
          <button
            type="button"
            onClick={() => {
              updateSearch("");
              updateCategory("");
            }}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Clear filters
          </button>
        )}
      </div>

      {loadError && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {loadError}
        </p>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-zinc-500">
                  Product
                </th>
                <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-zinc-500">
                  Your price
                </th>
                {COMPETITOR_SOURCES.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-zinc-500">
                    {c.label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-zinc-500">
                  Market
                </th>
                <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-zinc-500">
                  Position
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                    Loading products…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                    {search || category ? "No products match these filters." : "No products yet."}
                  </td>
                </tr>
              ) : (
                rows.map(({ product, pos }) => (
                  <tr key={product.id} className={loading ? "opacity-50" : undefined}>
                    <td className="px-4 py-2 text-sm">
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="font-medium text-zinc-900 hover:underline focus-visible:underline dark:text-zinc-100"
                      >
                        {product.title}
                      </Link>
                      {(product.brand || product.sku) && (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {[product.brand, product.sku].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                      {money(pos?.our_price ?? product.list_price)}
                    </td>
                    {COMPETITOR_SOURCES.map((c) => {
                      const comp = findCompetitorPrice(pos, c.key);
                      return (
                        <td
                          key={c.key}
                          className="whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200"
                        >
                          {comp ? (
                            <span className={comp.in_stock ? undefined : "text-zinc-400 line-through"}>
                              {money(comp.price)}
                            </span>
                          ) : (
                            <span className="text-zinc-400">–</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-4 py-2 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                      {money(pos?.market_median)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm">
                      <PositionBadge position={pos?.position} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">
            Page {page}
            {!hasNextPage && page === 1 && rows.length > 0 ? "" : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                setPage((p) => Math.max(1, p - 1));
              }}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!hasNextPage || loading}
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                setPage((p) => p + 1);
              }}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}