# Server-Side Pagination Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all table pages (assets, accessories, consumables, licences) from client-side pagination (fetch all → filter/sort/paginate in browser) to server-side pagination (fetch one page at a time from the API).

**Architecture:** Each table page currently fetches ALL records server-side and passes them as props to a client component that does filtering/sorting/pagination in the browser. The API routes already support offset-based pagination with `parsePaginationParams()`. The change: table client components will fetch data from the API directly using URL state params, receiving only one page at a time. Reference data (locations, users, statuses, manufacturers, etc.) stays server-side since it's small and cached.

**Tech Stack:** Next.js 16 App Router, Prisma, PostgreSQL, `useUrlState` hook, existing `PaginatedResponse<T>` type from `src/lib/pagination.ts`.

---

## File Structure

### Shared (new)

- **Create:** `src/hooks/usePaginatedFetch.ts` — Reusable hook that fetches paginated data from an API endpoint using current URL params. Returns `{ data, total, totalPages, isLoading, error, mutate }`. Used by all four tables.

### Assets

- **Modify:** `src/app/assets/page.tsx` — Remove `getAssets()` call. Only fetch reference data.
- **Modify:** `src/app/assets/ui/AssetsTableClient.tsx` — Pass API URL and reference data instead of `data` prop.
- **Modify:** `src/ui/assets/DashboardTable.tsx` — Accept paginated data + total count. Remove client-side filtering/search (now server-side). Keep client-side sorting within the current page as-is. Replace `filteredItems.length / rowsPerPage` pagination with server-provided `totalPages`.

### Accessories

- **Modify:** `src/app/accessories/page.tsx` — Remove `getAccessories()` call.
- **Modify:** `src/ui/accessories/AccessoriesTable.tsx` — Add `usePaginatedFetch` for data loading.

### Consumables

- **Modify:** `src/app/consumables/page.tsx` — Remove `getConsumables()` call.
- **Modify:** `src/ui/consumables/ConsumablesTable.tsx` — Add `usePaginatedFetch` for data loading.

### Licences

- **Modify:** `src/app/licences/page.tsx` — Remove `getLicences()` call.
- **Modify:** `src/ui/licences/LicencesTable.tsx` — Add `usePaginatedFetch` for data loading.

---

## Chunk 1: Shared Hook + Assets Table

### Task 1: Create `usePaginatedFetch` hook

**Files:**

- Create: `src/hooks/usePaginatedFetch.ts`

This hook encapsulates the fetch-on-URL-change pattern reused by all four tables.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/usePaginatedFetch.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface UsePaginatedFetchReturn<T> {
  result: PaginatedResult<T> | null;
  isLoading: boolean;
  error: string | null;
  /** Re-fetch with current params */
  refresh: () => void;
}

/**
 * Fetches paginated data from an API endpoint whenever `params` change.
 *
 * @param apiUrl  Base API path, e.g. "/api/asset"
 * @param params  URL search params to append (page, pageSize, search, sortBy, sortOrder, etc.)
 */
export function usePaginatedFetch<T>(
  apiUrl: string,
  params: Record<string, string>,
): UsePaginatedFetchReturn<T> {
  const [result, setResult] = useState<PaginatedResult<T> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Abort controller to cancel in-flight requests when params change
  const abortRef = useRef<AbortController | null>(null);
  // Track current params to detect changes
  const paramsKey = JSON.stringify(params);

  const fetchData = useCallback(async () => {
    // Cancel any previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) qs.set(key, value);
      }

      const res = await fetch(`${apiUrl}?${qs.toString()}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const json = await res.json();
      // API returns PaginatedResponse shape when page/pageSize params are present
      if (!controller.signal.aborted) {
        setResult({
          data: json.data,
          total: json.total,
          page: json.page,
          pageSize: json.pageSize,
          totalPages: json.totalPages,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Fetch failed");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, paramsKey]);

  useEffect(() => {
    fetchData();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  return { result, isLoading, error, refresh: fetchData };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePaginatedFetch.ts
git commit -m "feat: add usePaginatedFetch hook for server-side pagination"
```

---

### Task 2: Update Assets page server component

**Files:**

- Modify: `src/app/assets/page.tsx`

Remove the `getAssets()` and `getUserAssets()` calls. The page only provides reference data now.

- [ ] **Step 1: Update page.tsx**

Remove `getAssets` and `getUserAssets` from the import and `Promise.all`.
Remove the `databaseAssets` mapping.
Stop passing `data` and `userAssets` to `AssetsTableClient`.

The page should now look like:

```tsx
import React from "react";
import AssetsTableClient from "./ui/AssetsTableClient";
import {
  getLocation,
  getUsers,
  getStatus,
  getManufacturers,
  getModel,
  getCategories,
} from "@/lib/data";

export const metadata = {
  title: "Asset Tracker - Assets",
  description: "Asset management tool",
};

export default async function Page() {
  const [location, user, status, manufacturer, model, categories] =
    await Promise.all([
      getLocation(),
      getUsers(),
      getStatus(),
      getManufacturers(),
      getModel(),
      getCategories(),
    ]);

  return (
    <div>
      <AssetsTableClient
        locations={location}
        user={user}
        status={status}
        manufacturers={manufacturer}
        models={model}
        categories={categories}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/assets/page.tsx
git commit -m "refactor: remove bulk asset fetch from assets page"
```

---

### Task 3: Update AssetsTableClient wrapper

**Files:**

- Modify: `src/app/assets/ui/AssetsTableClient.tsx`

No longer receives `data`, `columns`, `selectOptions`, or `userAssets`. These move into DashboardTable itself.

- [ ] **Step 1: Update the wrapper**

The wrapper stays thin — it just passes through reference data:

```tsx
"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const DashboardTable = dynamic(
  () => import("../../../ui/assets/DashboardTable"),
  {
    ssr: false,
  },
);

export default function AssetsTableClient(props) {
  return (
    <Suspense fallback={null}>
      <DashboardTable {...props} />
    </Suspense>
  );
}
```

(No functional change here, but the props flowing through are now only reference data.)

- [ ] **Step 2: Commit**

```bash
git add src/app/assets/ui/AssetsTableClient.tsx
git commit -m "refactor: update AssetsTableClient props for server-side pagination"
```

---

### Task 4: Update DashboardTable for server-side data fetching

**Files:**

- Modify: `src/ui/assets/DashboardTable.tsx`

This is the biggest change. Key modifications:

1. Import and use `usePaginatedFetch` to fetch asset data from `/api/asset`
2. Build fetch params from existing `useUrlState` values (search, page, pageSize, sortCol, sortDir)
3. Remove `data` and `userAssets` from props — fetch them internally
4. Remove client-side `filteredItems` search filtering (now server-side)
5. Replace `pages = Math.ceil(filteredItems.length / rowsPerPage)` with `result.totalPages`
6. Keep `columns` and `selectOptions` as constants inside the component (they were already static)
7. Keep client-side sorting for reference-data columns (locationid, manufacturerid, etc.) since these sort by resolved names which the API doesn't support
8. Add loading state when data is being fetched
9. Fetch userAssets from `/api/asset` response or separately

- [ ] **Step 1: Add usePaginatedFetch import and remove data/userAssets props**

At the top of the component, add:

```typescript
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";
```

Change the function signature from:

```typescript
export default function App({
  data,
  locations,
  status,
  user,
  manufacturers,
  models,
  categories,
  columns,
  selectOptions,
  userAssets,
});
```

To:

```typescript
export default function App({
  locations,
  status,
  user,
  manufacturers,
  models,
  categories,
});
```

Move `columns` and `selectOptions` to constants inside the component body.

- [ ] **Step 2: Wire up usePaginatedFetch**

After the `useUrlState` block (~line 121), add the fetch hook:

```typescript
// Map URL state to API params
const apiParams = useMemo(
  () => ({
    page: showAll ? "1" : urlState.page,
    pageSize: showAll ? "10000" : urlState.pageSize,
    search: urlState.search || "",
    sortBy: urlState.sortCol || "",
    sortOrder: urlState.sortDir === "descending" ? "desc" : "asc",
  }),
  [urlState, showAll],
);

const { result: paginatedResult, isLoading } = usePaginatedFetch<any>(
  "/api/asset",
  apiParams,
);

// Sanitize Decimal fields from API response
const assetsData = useMemo(
  () =>
    (paginatedResult?.data ?? []).map((a) => ({
      ...a,
      purchaseprice: a.purchaseprice != null ? Number(a.purchaseprice) : null,
    })),
  [paginatedResult],
);
```

- [ ] **Step 3: Remove client-side search filtering from `filteredItems`**

Replace the `filteredItems` memo (lines ~518-542) with a simpler version that only applies client-side status filtering (since the API doesn't filter by status name):

```typescript
const filteredItems = useMemo(() => {
  let items = [...assetsData];
  // Status filtering still client-side (API filters by statusId, not name)
  if (statusFilter.size !== statusOptions.length) {
    items = items.filter((asset) => {
      const assetStatus = status.find(
        (stat) => stat.statustypeid === asset.statustypeid,
      );
      return (
        assetStatus &&
        statusFilter.has(assetStatus.statustypename.toLowerCase())
      );
    });
  }
  return items;
}, [assetsData, status, statusFilter]);
```

- [ ] **Step 4: Replace client-side pagination with server-side totals**

Replace:

```typescript
const pages = Math.ceil(filteredItems.length / rowsPerPage);
```

With:

```typescript
const pages = paginatedResult?.totalPages ?? 1;
```

Replace the client-side `items` slicing:

```typescript
const items = useMemo(() => {
  const start = (page - 1) * rowsPerPage;
  return filteredItems.slice(start, start + rowsPerPage);
}, [page, filteredItems, rowsPerPage]);
```

With simply using the full filtered list (pagination is already server-side):

```typescript
const items = filteredItems;
```

- [ ] **Step 5: Add loading indicator**

In the JSX, before the table body renders, add a loading state:

```tsx
{isLoading && assetsData.length === 0 ? (
  <div className="flex h-40 items-center justify-center text-muted-foreground">
    Loading assets...
  </div>
) : (
  // existing table JSX
)}
```

Optionally add a subtle loading bar at the top when `isLoading && assetsData.length > 0` (re-fetching with existing data visible).

- [ ] **Step 6: Remove the old `data` state initialization**

Search for any `useState` that initializes from the old `data` prop (likely `const [assetsData, setAssetsData] = useState(data)` or similar). Remove it since `assetsData` now comes from `usePaginatedFetch`.

Also search for any auto-refresh/visibility-change logic that calls `fetch` to refresh data — it should call the hook's `refresh()` instead, or be removed since the hook handles re-fetching.

- [ ] **Step 7: Test manually**

1. Start dev server: `npm run dev`
2. Navigate to `/assets`
3. Verify:
   - Table loads with paginated data (default 20 rows)
   - Changing page size works (dropdown)
   - Next/prev page buttons work
   - Search box triggers server-side search (check Network tab — request to `/api/asset?search=...&page=1`)
   - Sort columns still work (client-side within page)
   - Status filter dropdown works
   - URL params update and are shareable

- [ ] **Step 8: Commit**

```bash
git add src/ui/assets/DashboardTable.tsx
git commit -m "feat: switch assets table to server-side pagination"
```

---

## Chunk 2: Accessories, Consumables, Licences Tables

### Task 5: Update AccessoriesTable for server-side pagination

**Files:**

- Modify: `src/app/accessories/page.tsx`
- Modify: `src/ui/accessories/AccessoriesTable.tsx`

- [ ] **Step 1: Update page.tsx**

Remove `getAccessories()` from imports and `Promise.all`. Stop passing `items` prop. Keep reference data only:

```tsx
export default async function Page() {
  const [manufacturers, models, statuses, locations, suppliers, categories] =
    await Promise.all([
      getManufacturers(),
      getModel(),
      getStatus(),
      getLocation(),
      getSuppliers(),
      getAccessoryCategories(),
    ]);

  return (
    <div>
      <Suspense fallback={null}>
        <AccessoriesTable
          manufacturers={manufacturers}
          models={models}
          statuses={statuses}
          categories={categories}
          locations={locations}
          suppliers={suppliers}
        />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Update AccessoriesTable.tsx**

Apply the same pattern as DashboardTable:

1. Import `usePaginatedFetch`
2. Remove `items` from props
3. Add `usePaginatedFetch<any>("/api/accessories", apiParams)`
4. Map URL state (search, page, pageSize) to API params
5. Remove client-side search filtering
6. Use `result.totalPages` for pagination
7. Add loading state
8. Sanitize Decimal fields in the response mapping

- [ ] **Step 3: Commit**

```bash
git add src/app/accessories/page.tsx src/ui/accessories/AccessoriesTable.tsx
git commit -m "feat: switch accessories table to server-side pagination"
```

---

### Task 6: Update ConsumablesTable for server-side pagination

**Files:**

- Modify: `src/app/consumables/page.tsx`
- Modify: `src/ui/consumables/ConsumablesTable.tsx`

- [ ] **Step 1: Update page.tsx**

Remove `getConsumables()` from imports and `Promise.all`. Remove the `items` mapping. Keep reference data only.

- [ ] **Step 2: Update ConsumablesTable.tsx**

Same pattern:

1. Import `usePaginatedFetch`
2. Remove `items` from props
3. Add `usePaginatedFetch<any>("/api/consumable", apiParams)`
4. Wire up URL state → API params
5. Remove client-side search, use server totals for pagination
6. Add loading state

- [ ] **Step 3: Commit**

```bash
git add src/app/consumables/page.tsx src/ui/consumables/ConsumablesTable.tsx
git commit -m "feat: switch consumables table to server-side pagination"
```

---

### Task 7: Update LicencesTable for server-side pagination

**Files:**

- Modify: `src/app/licences/page.tsx`
- Modify: `src/ui/licences/LicencesTable.tsx`

- [ ] **Step 1: Update page.tsx**

Remove `getLicences()` from imports and `Promise.all`. Remove the `licences` mapping. Keep reference data only.

- [ ] **Step 2: Update LicencesTable.tsx**

Same pattern:

1. Import `usePaginatedFetch`
2. Remove `items` from props
3. Add `usePaginatedFetch<any>("/api/licence", apiParams)`
4. Wire up URL state → API params
5. Remove client-side search, use server totals for pagination
6. Add loading state
7. Keep any expiration-date-specific filtering as client-side (or add to API if needed)

- [ ] **Step 3: Commit**

```bash
git add src/app/licences/page.tsx src/ui/licences/LicencesTable.tsx
git commit -m "feat: switch licences table to server-side pagination"
```

---

## Chunk 3: Cleanup

### Task 8: Remove unused cached data functions

**Files:**

- Modify: `src/lib/data.ts`

- [ ] **Step 1: Remove `getAssets()` cache if no longer called**

Since the page no longer calls `getAssets()`, the `cached("assets_all", ...)` wrapper is no longer needed by the page component. However, check if `getAssets()` is used elsewhere (e.g., user detail pages, export). Only remove the function if it has zero remaining callers.

Run: `grep -r "getAssets\b" src/ --include="*.tsx" --include="*.ts" | grep -v "node_modules"`

Same for `getAccessories()`, `getConsumables()`, `getLicences()`, `getUserAssets()`.

- [ ] **Step 2: Remove unused cache invalidation calls if functions are removed**

If `getAssets()` is removed, the `invalidateCache("assets_all")` calls in the API routes are still harmless (they delete a cache key that doesn't exist) but can be cleaned up.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data.ts
git commit -m "chore: remove unused bulk data fetch functions"
```

---

### Task 9: End-to-end verification

- [ ] **Step 1: Test all four table pages**

For each page (`/assets`, `/accessories`, `/consumables`, `/licences`):

1. Navigate to the page — table loads with paginated data
2. Search — request goes to API with `?search=...` (check Network tab)
3. Change page — request goes to API with `?page=2`
4. Change page size — request goes to API with `?pageSize=50`
5. Sort — works (client-side within page)
6. URL is shareable — copy URL, paste in new tab, same state loads
7. Create/edit/delete an item — table refreshes with updated data

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "feat: complete server-side pagination for all table pages"
```
