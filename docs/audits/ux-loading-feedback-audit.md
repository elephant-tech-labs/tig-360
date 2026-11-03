# UX audit: loading, navigation and interaction feedback

Date: 2026-11-03 · Branch: `feat/ux-navigation-feedback` · Scope: every route, the shared navigation, forms, server actions and existing loading states. Performance findings are limited to latency the user waits through when navigating or submitting.

## Baseline (before Phase 1)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | 5 errors, all already on `main` (`react-hooks/purity` ×4, `react/no-unescaped-entities` ×1). PR #51 fixes them; this branch does not touch them. |
| `npm test` | 44 / 44 pass |
| Browser tests | none exist. No safe environment: there is no `.env.local`, no Docker for a local Supabase, and production data is off limits. |

## Root cause

Two structural facts explain most of the "I clicked and nothing happened" experience.

1. **There are no loading boundaries.** The app has no `loading.tsx` or `error.tsx` files. Every workspace route is dynamic (cookies plus Supabase), so Next.js can prefetch nothing for it. A click therefore leaves the old page on screen until the whole new page has rendered on the server, including every sequential database round trip. The user gets no signal that the click registered.
2. **The shell is rendered inside each page.** Each of the 22 workspace pages wrapped itself in `<AppShell>`. That made it impossible to add loading states without the sidebar flickering, because a `loading.tsx` fallback would replace the sidebar too. It also meant the sidebar was rebuilt on every navigation.

Fixing those two things in shared code addresses the P0 findings on every screen at once.

## Perceived vs. real slowness

- **Perceived slowness** means the work is fast enough but the UI gives no acknowledgement: no route fallback, no pending link state, an active tab that only moves after the server responds, and banners that screen readers never announce. Loading boundaries, link pending states and announcements fix this. They do not change server time.
- **Real slowness** means extra sequential round trips on the server, listed under "Verified data-fetching bottlenecks" below. Only fixing the queries helps here. Each removed round trip saves one network trip to Supabase, typically 30–150 ms from Vercel. Nothing here was measured in a browser, because no safe environment exists. The round-trip counts come from reading the code.

## Findings

Priority: **P0** breaks the core expectation on most screens · **P1** high impact on frequent flows · **P2** noticeable, limited scope · **P3** minor, or needs a product decision.

| ID | Priority | Where | Problem | Shared fix | Phase 1 |
|---|---|---|---|---|---|
| NAV-1 | P0 | all 22 workspace routes | No loading boundary. Clicks give no feedback until the server finishes rendering. | `loading.tsx` boundaries that share one skeleton component | ✅ |
| NAV-2 | P0 | `components/app-shell.tsx`, all workspace pages | Each page renders the shell, so a route fallback would also replace the sidebar. | Route group `app/(workspace)/layout.tsx` owns the shell. URLs are unchanged. | ✅ |
| NAV-3 | P1 | sidebar, job workflow tabs, management tabs | No pressed or pending state. The sidebar's active highlight changes only after the server responds. | Client `WorkspaceNav` (active state from `usePathname`) plus `LinkPendingIndicator` (Next.js `useLinkStatus`, shown after a delay so it never flickers). `aria-current="page"` on active items. | ✅ |
| ERR-1 | P1 | 17 pages, 32 `throw new Error(...)` | Any Supabase error replaces the whole app with the default Next.js error screen: no retry and no navigation. | `app/(workspace)/error.tsx` keeps the shell and offers "Try again" | ✅ |
| A11Y-1 | P1 | 25 of 28 `.form-alert` banners | Success and error banners shown after a server redirect have no `role`, so screen-reader users never hear "Saved" or the error. | `role="status"` / `role="alert"` on every banner | ✅ |
| PERF-1 | P1 | `lib/current-organization.ts` (every page and action) | `auth.getUser()` and then the membership query run back to back, although the query does not use `user` (RLS scopes it). | `Promise.all` plus React `cache()` so the layout and the page share one lookup | ✅ (1 round trip per navigation) |
| PERF-2 | P1 | `lib/reports/load-report.ts:345-366` (review page) | Five sequential storage stages: photos, then logo, then cover, then diagram, then signature. The cover URL is signed twice. | One `Promise.all`; reuse the photo's URL for the cover | ✅ (up to 4 round trips, 1 fewer request) |
| PERF-3 | P1 | job pages: overview `:61`, findings `:93`, drawing `:66`, photos `:61,:106` | `getJobWorkflowStates` (13 queries) runs only after the page's own queries finish, though it needs only `jobId` and the organization. | Move it into the existing `Promise.all` | ✅ (1–2 round trips per job tab) |
| FORM-1 | P2 | remove company logo, delete report content block, remove inspector signature, refresh signature status, sign out | Plain submit buttons: no pending state, and double submission is possible. | Reuse `PendingSubmitButton` | ✅ |
| A11Y-2 | P2 | all spinners and animations | `prefers-reduced-motion` is not respected anywhere. | One global reduced-motion rule | ✅ |
| A11Y-3 | P2 | sidebar on dark background | The default focus ring is hard to see on `#17201d`. | `:focus-visible` outline on nav items | ✅ |
| PERF-4 | P2 | `team/inspectors/page.tsx:60-66` | N+1: one sequential `createSignedUrl` per inspector signature | One `createSignedUrls` batch | ✅ |
| PERF-5 | P2 | `management/page.tsx:20-26` | Two independent queries run in sequence | `Promise.all` | ✅ |
| PERF-6 | P2 | job pages (review, send, drawing, photos, findings) | `getJobWorkflowStates` reads again tables the page already fetched. These reads run in parallel, so they add database load, not wait time. | Let pages pass rows they already loaded into the workflow loader | Phase 2 |
| NAV-4 | P2 | contacts search, WDO filters | Plain GET forms trigger full document reloads. The browser shows its native progress bar, but the shell remounts. | `next/form` for client-side navigation | Phase 2 |
| A11Y-4 | P2 | redirect-based errors | Focus is not moved to the error banner after a failed submission. | Focus the banner on mount, or use `useActionState` per form | Phase 2 |
| PERF-7 | P2 | `management/report-content/page.tsx:55` | One Tiptap editor is created eagerly for each content block | Mount the editor only when that block is opened for editing | Phase 2 |
| PERF-8 | P3 | `proxy.ts` and `getCurrentContext` | Two `auth.getUser()` calls to Supabase Auth per navigation | Consider `auth.getClaims()` (local JWT verification) in pages; needs a security review | Phase 2 |
| PERF-9 | P3 | `proposal/page.tsx:118` | A GET render calls the `ensure_job_proposal` RPC (a write during a read), which adds a stage | Create the proposal from an action instead | Phase 2 (product) |
| PERF-10 | P3 | `review/actions.tsx`, `proposal/actions.tsx` | `@react-pdf/renderer` is imported at module scope on the server | Use dynamic `import()` inside the generate action | Phase 2 |
| UX-1 | P3 | sidebar "Schedule", "Properties", "Documents"; topbar search and notifications | Links point to `#` and controls have no handler, so clicks do nothing | Hide them, or mark them "coming soon" (a product decision) | not in scope |

### Already good (keep)

- `PendingSubmitButton` (`useFormStatus`) is used 47 times. Server-action forms already disable their buttons while pending and are usable again once the action returns or redirects.
- Success messages appear only after the server action redirects, so success is never shown before the server confirms it.
- The client workspaces (findings, photos, drawing, job contacts) gate their buttons on `useTransition` or local pending state, and `job-contact-manager` already uses an `aria-live` slot.
- Konva is already lazy-loaded with `next/dynamic` and `ssr: false`.

## Phase 1 design

- **Shell:** `app/(workspace)/layout.tsx` renders `AppShell` once. A route group keeps every URL the same. Shared layouts persist across navigations, so only page content suspends.
- **Route fallbacks:** `loading.tsx` files at `(workspace)/`, `jobs/`, `contacts/`, `compliance/wdo/` and `management/` all re-export one client `WorkspaceLoading` component. It picks a skeleton from the destination path: list, form, job workspace or generic. Each skeleton reuses the real page's layout classes (`.page-heading`, `.form-page`, `.job-workspace-header`, `.job-authoring-nav`, …), so sizes match. The skeleton fades in after 150 ms, so fast transitions don't flash. It carries `role="status"` and a visually hidden "Loading …" label.
- **Job workflow tabs:** these have no `loading.tsx` on purpose. Switching tabs keeps the current job header and tabs visible while the clicked tab shows a pending indicator, instead of blanking the header. Entering a job from the list shows the job-workspace skeleton.
- **No progress percentages and no new dependencies.**

## Testing approach

- Unit tests (`node --test`) for the pure routing logic: the section key for the active nav item, and which skeleton variant a given path gets.
- Server-render tests (`react-dom/server`) for `WorkspaceLoading`, the error boundary and the nav: correct ARIA roles, no progress numbers, and the right variant per route.
- Browser (Playwright): **not run**. Running it needs an authenticated session against a Supabase project. Only production is configured, and production data must not be touched. A follow-up should add a seeded local Supabase (`supabase start`, which needs Docker) and Playwright scenarios for: a sidebar click showing the skeleton within 300 ms, the shell staying mounted, the pending tab indicator, and a double-click submitting once.
