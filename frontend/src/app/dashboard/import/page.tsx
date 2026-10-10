"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const API = "/api/v1";
const PREVIEW_ROW_LIMIT = 50;

/* ---------- Types (backend response shapes) ---------- */

type Store = {
  id: number;
  organization_id: number;
  name: string;
  domain: string | null;
  platform: string | null;
  currency: string | null;
  country: string | null;
  status: string | null;
};

type ImportRowResult = {
  row_number: number;
  data: Record<string, unknown>;
  status: "valid" | "warning" | "error" | string;
  messages: string[];
  will_update: boolean;
};

type ImportSummary = {
  import_id: string;
  total_rows: number;
  valid: number;
  warnings: number;
  errors: number;
};

type ImportPreviewResponse = {
  summary: ImportSummary;
  rows: ImportRowResult[];
};

type ImportCommitResult = {
  created: number;
  updated: number;
  skipped: number;
};

/* ---------- Helpers ---------- */

function RowStatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    valid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    error: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
      {status}
    </span>
  );
}

/* ---------- Page ---------- */

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [checkingStore, setCheckingStore] = useState(true);
  const [store, setStore] = useState<Store | null>(null);

  // Store creation form
  const [storeName, setStoreName] = useState("");
  const [storeCurrency, setStoreCurrency] = useState("USD");
  const [creatingStore, setCreatingStore] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // CSV import flow
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);

  const loadStore = useCallback(async () => {
    setCheckingStore(true);
    try {
      const stores = await apiFetch<Store[]>(`${API}/stores`);
      setStore(stores.length > 0 ? stores[0] : null);
    } catch {
      setStore(null);
    } finally {
      setCheckingStore(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadStore();
    });
    return () => {
      active = false;
    };
  }, [loadStore]);

  async function createStore() {
    if (!storeName.trim()) {
      setCreateError("Store name is required.");
      return;
    }
    setCreatingStore(true);
    setCreateError(null);
    try {
      const created = await apiFetch<Store>(`${API}/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: storeName.trim(), currency: storeCurrency || null }),
      });
      setStore(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create the store");
    } finally {
      setCreatingStore(false);
    }
  }

  function resetImportState() {
    setSelectedFile(null);
    setPreview(null);
    setValidateError(null);
    setCommitResult(null);
    setCommitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreview(null);
    setCommitResult(null);
    setValidateError(null);
    setCommitError(null);
  }

  async function validateFile() {
    if (!store || !selectedFile) return;
    setValidating(true);
    setValidateError(null);
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const result = await apiFetch<ImportPreviewResponse>(`${API}/stores/${store.id}/products/import/validate`, {
        method: "POST",
        body: formData,
      });
      setPreview(result);
    } catch (err) {
      setValidateError(err instanceof Error ? err.message : "Could not validate this file");
    } finally {
      setValidating(false);
    }
  }

  async function commitImport() {
    if (!store || !preview) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const result = await apiFetch<ImportCommitResult>(`${API}/stores/${store.id}/products/import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ import_id: preview.summary.import_id }),
      });
      setCommitResult(result);
      setPreview(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Could not import this file");
    } finally {
      setCommitting(false);
    }
  }

  if (checkingStore) {
    return <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-zinc-500">Loading…</div>;
  }

  /* ---------- Step 1: no store yet — show the create-store form ---------- */
  if (!store) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Create your store</h1>
          <p className="mt-1 text-sm text-zinc-500">
            You need a store before you can import products. This only has to be done once.
          </p>
        </div>

        {createError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
            {createError}
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Store name</label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="e.g. My Electronics Store"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Currency</label>
            <select
              value={storeCurrency}
              onChange={(e) => setStoreCurrency(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="USD">USD</option>
              <option value="PKR">PKR</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <button
            type="button"
            onClick={createStore}
            disabled={creatingStore}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {creatingStore ? "Creating…" : "Create store"}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Step 2: store exists — show the CSV import flow ---------- */
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Import products</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Importing into <span className="font-medium text-zinc-700 dark:text-zinc-300">{store.name}</span>. The CSV
          needs a <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">Product Name</code>{" "}
          column. Optional columns: SKU, UPC, EAN, GTIN, Brand, Model, Price, URL, Category.
        </p>
      </div>

      {/* File picker */}
      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={onFileChange}
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-200 dark:text-zinc-300 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
        />
        {validateError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
            {validateError}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={validateFile}
            disabled={!selectedFile || validating}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {validating ? "Checking file…" : "Check file"}
          </button>
          {(selectedFile || preview || commitResult) && (
            <button
              type="button"
              onClick={resetImportState}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Start over
            </button>
          )}
        </div>
      </div>

      {/* Commit result */}
      {commitResult && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">Import complete</p>
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            {commitResult.created} created, {commitResult.updated} updated, {commitResult.skipped} skipped.
          </p>
          <Link
            href="/dashboard/products"
            className="inline-block text-sm font-medium text-emerald-900 hover:underline dark:text-emerald-200"
          >
            View products →
          </Link>
        </div>
      )}

      {commitError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {commitError}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">{preview.summary.total_rows}</span> rows found
            </span>
            <span className="text-emerald-700 dark:text-emerald-400">
              <span className="font-medium">{preview.summary.valid}</span> valid
            </span>
            <span className="text-amber-700 dark:text-amber-400">
              <span className="font-medium">{preview.summary.warnings}</span> warnings
            </span>
            <span className="text-rose-700 dark:text-rose-400">
              <span className="font-medium">{preview.summary.errors}</span> errors (will be skipped)
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Row</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Product name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {preview.rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => (
                    <tr key={row.row_number}>
                      <td className="px-4 py-2 text-sm text-zinc-500">{row.row_number}</td>
                      <td className="px-4 py-2 text-sm text-zinc-800 dark:text-zinc-200">
                        {String(row.data?.name ?? row.data?.title ?? "—")}
                        {row.will_update && (
                          <span className="ml-2 text-xs text-zinc-400">(will update existing)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <RowStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-500">
                        {row.messages.length > 0 ? row.messages.join("; ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > PREVIEW_ROW_LIMIT && (
              <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
                Showing first {PREVIEW_ROW_LIMIT} of {preview.rows.length} rows.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={commitImport}
            disabled={committing || preview.summary.valid + preview.summary.warnings === 0}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {committing
              ? "Importing…"
              : `Import ${preview.summary.valid + preview.summary.warnings} products`}
          </button>
        </div>
      )}
    </div>
  );
}
