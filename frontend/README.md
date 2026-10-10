# Pricing Intelligence Dashboard

Frontend for the Pricing Intelligence Platform — a multi-tenant web application that tracks a store's product catalog against competitor pricing (Amazon, Walmart, Best Buy) and surfaces price changes, pricing opportunities, and competitive analytics on a live dashboard.

## Tech Stack

- [Next.js](https://nextjs.org) (App Router)
- React + TypeScript
- Tailwind CSS

## Prerequisites

- Node.js 18+
- The backend API must be running (see the backend repository's README for setup via Docker Compose)

## Getting Started

1. Install dependencies:
```bash
   npm install
```

2. Configure environment variables (API base URL, etc.) in `.env.local` — see `.env.example` for required values.

3. Run the development server:
```bash
   npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Pages

| Route | Description |
| --- | --- |
| `/dashboard` | Overview — key metrics, recent price changes, competitive position |
| `/dashboard/products` | Full product catalog with search and filters |
| `/dashboard/products/[id]` | Product detail — price history, competitor comparison, match status |
| `/dashboard/price-changes` | Recent price changes across the catalog |
| `/dashboard/opportunities` | Products priced significantly above or below the market median |
| `/dashboard/competitors` | Competitor-level pricing summary and trends |
| `/dashboard/import` | CSV catalog import (validate, preview, commit) |
| `/dashboard/alerts` | Alert rule management |
| `/dashboard/admin` | Data quality and connector freshness overview |

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint      # Run ESLint
```

Build and lint run automatically in CI on every push and pull request.