"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const API = "/api/v1";

/* ---------- Types (backend response shapes) ---------- */

type Store = {
  id: number;
  name: string;
  currency: string | null;
};

type AlertMetric = "price_drop_pct" | "price_increase_pct";

type AlertRule = {
  id: number;
  store_id: number;
  metric: AlertMetric;
  threshold_pct: number;
  email_enabled: boolean;
  created_at: string;
};

type TriggeredAlert = {
  rule_id: number;
  metric: AlertMetric;
  threshold_pct: number;
  product_id: number;
  product_title: string;
  source: string;
  percent_change: number;
  observed_at: string;
};

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

function metricLabel(metric: AlertMetric) {
  return metric === "price_drop_pct" ? "Price drops by at least" : "Price increases by at least";
}

function parseDate(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

function formatDate(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ---------- Page ---------- */

export default function AlertsPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [noStore, setNoStore] = useState(false);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [alerts, setAlerts] = useState<TriggeredAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New rule form
  const [metric, setMetric] = useState<AlertMetric>("price_drop_pct");
  const [threshold, setThreshold] = useState("10");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);

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
      const [rulesData, alertsData] = await Promise.all([
        apiFetch<AlertRule[]>(`${API}/stores/${s.id}/alert-rules`),
        apiFetch<TriggeredAlert[]>(`${API}/stores/${s.id}/alerts`),
      ]);
      setRules(rulesData);
      setAlerts(alertsData);
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

  async function createRule() {
    if (!store) return;
    const value = parseFloat(threshold);
    if (Number.isNaN(value) || value <= 0) {
      setCreateError("Enter a threshold percentage greater than 0.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const rule = await apiFetch<AlertRule>(`${API}/stores/${store.id}/alert-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric, threshold_pct: value, email_enabled: emailEnabled }),
      });
      setRules((prev) => [rule, ...prev]);
      // Refresh triggered alerts since a new rule may already match existing price changes
      if (store) {
        apiFetch<TriggeredAlert[]>(`${API}/stores/${store.id}/alerts`)
          .then(setAlerts)
          .catch(() => {});
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create this rule");
    } finally {
      setCreating(false);
    }
  }

  async function deleteRule(ruleId: number) {
    if (!store) return;
    setDeletingId(ruleId);
    try {
      await apiFetch(`${API}/stores/${store.id}/alert-rules/${ruleId}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setAlerts((prev) => prev.filter((a) => a.rule_id !== ruleId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this rule");
    } finally {
      setDeletingId(null);
    }
  }

  if (noStore) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Alerts</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This account has no store yet. Create a store and import your product catalog first.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Alerts</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Set a rule and we&apos;ll flag any competitor price change that crosses it.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Create rule form */}
      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">New alert rule</h2>
        {createError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
            {createError}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Trigger when</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as AlertMetric)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="price_drop_pct">Competitor price drops</option>
              <option value="price_increase_pct">Competitor price increases</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">By at least (%)</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-28 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <label className="flex items-center gap-2 pb-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Also email me
          </label>
          <button
            type="button"
            onClick={createRule}
            disabled={creating}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {creating ? "Adding…" : "Add rule"}
          </button>
        </div>
        {emailEnabled && (
          <p className="text-xs text-zinc-400">
            Note: email delivery isn&apos;t wired up yet in this demo — this just saves the preference.
          </p>
        )}
      </div>

      {/* Active rules */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Active rules</h2>
        {loading && rules.length === 0 ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-zinc-500">No alert rules yet. Add one above.</p>
        ) : (
          <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="text-zinc-800 dark:text-zinc-200">
                  {metricLabel(rule.metric)} <span className="font-medium">{rule.threshold_pct}%</span>
                  {rule.email_enabled && <span className="ml-2 text-xs text-zinc-400">(email on)</span>}
                </span>
                <button
                  type="button"
                  onClick={() => deleteRule(rule.id)}
                  disabled={deletingId === rule.id}
                  className="text-xs text-zinc-500 hover:text-rose-600 disabled:opacity-60 dark:hover:text-rose-400"
                >
                  {deletingId === rule.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Triggered alerts */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Triggered alerts ({alerts.length})
        </h2>
        {loading && alerts.length === 0 ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {rules.length === 0
              ? "Add a rule above to start seeing alerts here."
              : "No price changes currently match your rules."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full">
              <thead className="border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Competitor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Rule</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500">Change</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500">Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {alerts.map((a, i) => (
                  <tr key={`${a.rule_id}-${a.product_id}-${a.observed_at}-${i}`}>
                    <td className="px-4 py-2 text-sm">
                      <Link
                        href={`/dashboard/products/${a.product_id}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {a.product_title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {sourceLabel(a.source)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-500">
                      {metricLabel(a.metric)} {a.threshold_pct}%
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-2 text-right text-sm ${
                        a.percent_change < 0
                          ? "text-rose-700 dark:text-rose-400"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {a.percent_change < 0 ? "▼" : "▲"} {Math.abs(a.percent_change).toFixed(1)}%
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-zinc-400">
                      {formatDate(a.observed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
