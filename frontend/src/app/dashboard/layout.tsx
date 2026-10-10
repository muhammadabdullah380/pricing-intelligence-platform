"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearToken, getToken } from "@/lib/api";

// Naye pages bante jayenge to yahan link add karte jayenge
const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/price-changes", label: "Price Changes" },
  { href: "/dashboard/matches", label: "Review Queue" },
  { href: "/dashboard/opportunities", label: "Opportunities" },
  { href: "/dashboard/competitors", label: "Competitors" },
  { href: "/dashboard/import", label: "Import" },
  { href: "/dashboard/alerts", label: "Alerts" },
  { href: "/dashboard/admin", label: "Admin" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (!getToken()) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <Link href="/dashboard" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Pricing Intelligence
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    active
                      ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={logout}
            className="ml-auto text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Log out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
