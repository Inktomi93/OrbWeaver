---
kind: law
status: active
updated: 2026-09-23
---

# UI-Architecture-and-Layout: state and the stack (keep/dump)

Split off [UI-Architecture-and-Layout.md](UI-Architecture-and-Layout.md) for the 48 KiB law cap; part of **the UI law** family (§-map + reading order: `UI-Architecture-and-Layout.md` header).

### 5. State

- **Server state → TanStack Query** (+ tRPC via `@trpc/tanstack-react-query`). NEVER in zustand.
- **Client/UI state → Zustand** (DECIDED — D42; not Jotai/TanStack Store: gated-zustand is more machine-enforceable for amnesiac agents than free-form atoms). Gated by `state-files`: one `create(` per file, ≤10 top-level fields, no exported `set`/`getState`/store handle, `persist({name})` namespaced. Draft stores via `createEntityDraftStore`.
- **Local-state-first** — `useState`/props unless genuinely cross-tree; stores only for global concerns (active selection, theme, the stream buffer).
- **Lifecycle slices modeled as discriminated-union transitions**, not ad-hoc `setState` — the stream/turn lifecycle (`turnStarted → delta → turnCompleted|turnAborted`, the ghost slot) is a state machine; model it explicitly inside the store. No XState.

#### 5.1 Single-route shell + the jank-avoidance rule (the neo lesson)

The URL stays `/` (entity ids never in the address bar; multi-device sync is DB-is-truth + the bus, not URL-bookmarking). Single-route jank does not come from single-route — it comes from every surface reading one ambient "active character/chat" global and chasing it (a `this_chid`-style parity sync effect). **The rule:**

> surfaces own their own state · selecting a thing ≠ a cascade of side effects · NO effect making the right panel chase the active chat (no `this_chid` re-coupling).

If "open the library beside a live chat without it yanking the chat" is possible, the jank is gone. If real deep-links/back-forward ever become wanted, routes are a localized bolt-on (TanStack Router for the chat id only) — NOT a rewrite.

**The sanctioned cross-feature-navigation SEAM (the positive pattern that satisfies the rule):** shared client selection state (active section, active chat, open modal) lives in a **gated Zustand store BELOW the features** (`state/shell-store.ts`, `state/active-chat-store.ts`), NOT route-`useState` and NOT a feature. Arbitrary leaf writers — a rail button, a character card's "start chat", a message row's fork — call intent-named MODULE actions (`setActiveSection`/`selectChat`/`startNewChat`/`openModal`); **writers only WRITE, never write-because-they-read.** Reading has exactly THREE sanctioned shapes, all RENDER-only:

> 1. **The COMPOSITION reader** — the route (`home-page.tsx` reads the store → renders the right CONTENT/LIST into `AppShellProps.sections`); surfaces under it receive the selection as a PROP and never re-read it.
> 2. **The OWN-SECTION reader** — a section's LIST/CONTENT surface reading *its own* section's selection pointer to render (the library highlighting its selected row via `useSelectedCharacterId`).
> 3. **The MIRROR reader** — a shell-chrome/CONTEXT surface whose JOB is reflecting the active artifact and that the route cannot prop-thread (it mounts in a domain-agnostic shell slot): it subscribes to the CANONICAL pointer hook (`useActiveChatId`, never a hand-rolled handle derivation) and fetches its own data via Query keyed by that id. The store carries the POINTER; entity data comes from Query (whose cache dedupes across all readers — N readers, one fetch, one truth).
>
> What stays BANNED is **subscribe-and-EFFECT**: a `useEffect`/`useLayoutEffect` in `features/**` keyed on a shared-selection pointer (gate `no-effect-on-shared-selection`; app-shell is shell-tier-exempt for its layout/appearance root effects). "Do X when the selection changes" is a render derivation, not an effect. Because every reader shape is render-only, `this_chid`-chasing stays impossible by construction: (1) `app-shell` stays domain-agnostic (renders regions + `ReactNode` slots — zero `ChatHandle`/`Character` knowledge); (2) NO feature→feature imports — a `character` card starts a chat via `#state` writes alone, never importing `#features/chat` (dep-cruiser-enforced); (3) the same store action is the ONE home for a navigation both a new-chat flow AND fork-nav terminate at. This is the shape for "many arbitrary leaf components trigger a navigation" — reach for it, not prop-drilling or a shell callback that doesn't understand the domain.

The tab title still tracks the active entity even with the URL pinned to `/`: render React 19's native `<title>` from the active pane (metadata hoists to `<head>`) — never a `document.title =` effect.

### 6. The stack — keep / dump

| | Decision |
| - | - |
| **DUMP** | **shadcn** (copy-paste workflow) → hand-author `@orb/ui`. **Radix** → **Base UI**. **react-markdown + rehype-sanitize + remark-gfm + rehype-raw** → **Streamdown** (§6.3). **react-syntax-highlighter / Prism** → **Shiki** (free inside Streamdown). **nivo** → **ECharts** (D52). The `@/` alias → `#`. |
| **KEEP** | feature-slice · surfaces/anchors · state-files · intent tokens · the gate battery · **Tailwind v4** · **tailwind-variants** (slots; subsumes cva+clsx+tailwind-merge — D54) · **lucide** · **TanStack** (Query / Router-minimal / Form / Virtual) · **Zustand** · the satellites **cmdk · @dnd-kit (the `@dnd-kit/react` rewrite) · minisearch** · **ECharts** (D52). **Base UI native: toast + drawer** (dropped **sonner** + **vaul**, D54); **dropped react-resizable-panels** (shell uses the clamp-overlay, §11.1). |
| **WRAP** | every kept third-party lib lives behind `@orb/ui` (`ui-satellite-seals`); app imports `@orb/ui`, never the lib. |

#### 6.1 TanStack — keep, with discipline

> **`QueryClient` defaults:** `staleTime: Infinity` (the SSE bus drives freshness — **NOT `'static'`**, which silently ignores `invalidateQueries`) · `gcTime: 5*60_000` · `refetchOnWindowFocus: false` (bus owns liveness) · **`refetchOnReconnect: true`** (SSE-gap catch-up) · `refetchOnMount: true` · `networkMode: 'online'` · `structuralSharing: true` · `throwOnError: false` (the `<QueryBoundary>` opts in per-tree) · mutations `retry: 0` · global error toasts via `QueryCache`/`MutationCache` `onError` keyed off `meta`. Cache surgery is gated by `client-cache-surgery-only-in-data`, whose scanRoot exempts `data/` wholesale — the `setQueryData` inside `createEntityMutation.onMutate` (`data/create-entity-mutation.ts`) cannot trip it; stream-store writes are separately gated by `chat-stream-writes-in-bus-only`. Adopt `skipToken` (kills the `castId<X>("")` sentinel). The `@tanstack/eslint-plugin-query` rules are live in `eslint.config.js`.

- **Query / Form / Virtual: keep** (dropping = reinventing worse).
- **Router: use it MINIMALLY** — the single-route shell means the routes are hand-written in `packages/client/src/routes/` (`/`, `/login`); admin is a group inside the Settings SECTION at `/`, not a standalone route. The file-based codegen plugin is DROPPED — type-safety survives it (inference + one `declare module { Register }`). Real traps: `useBlocker` will NOT fire on the in-app editor pane-switch (a reducer state change, not a navigation), so the editor dirty-guard is **hand-rolled in-app**; and the router's built-in View Transitions fire only on the real URL commit, never on in-app section switches, so §4a's hand-rolled VT covers the in-app case. Steal-list: router-context DI (forward `queryClient`/`trpc`), `beforeLoad`+`redirect` auth gate, `lazyRouteComponent` for any heavy route added later, `createMemoryHistory` in tests, DEV-gated devtools.
- **Form threshold rule:** a **form factory** (§13) is the home for **ANY multi-field form** — trigger = **≥3 fields OR validation OR save/draft semantics**, NOT "is it an entity." Covers settings panels, connection/credential add+edit, group-chat config, room overrides, the theme editor, user-admin create/edit. Only genuinely trivial inputs stay plain controlled + the same Zod schema (a 1–2-field search box, a lone toggle, a single rename). Full surface→factory map: §13.4. RHF stays banned (Compiler-incompatible).

#### 6.2 Testing

Playwright CT (`.ct.tsx` under the `tests/ui` mirror — LIVE, `playwright-ct.config.ts`) for component tests + Playwright e2e (`.spec.ts`); central `tests/` mirror. Browser is Playwright, NOT Vitest (it hangs) — separate runners, never in `pnpm check`. The CT contract (token assertions, providers, fixtures): §13.7. Visual-regression screenshots: parked, adopt when the first themed surfaces stabilize.

#### 6.3 Markdown + code → `@orb/ui/markdown` = Streamdown — BUILT

- **Streamdown** is THE markdown renderer, used everywhere (chat AND static descriptions → one lib). It repairs incomplete/unterminated markdown mid-stream instead of flashing, does incremental DOM updates (react-markdown re-parses the whole message per token → ~O(n²) lag), and bundles **Shiki** + KaTeX + Mermaid + copy/download + security policies. Sealed as `@orb/ui/markdown` with **two trust policies** (`packages/ui/src/markdown/policy.ts`) + `toPlainText` (remark `strip-markdown` — previews/snippets/notifications). The concrete two-policy security spec: §11.6.

##### 6.3.1 The streaming-reveal stack — the three layers, and who owns each (D43)

Three layers, one owner each:

1. **Parse · repair · incremental · fade · security → Streamdown (owns this).** neo's `repairStreamingTail`, hand-rolled `incremental` reparse, and `.stream-word` CSS are NOT ported — Streamdown does all three.
2. **Pacing → `useSmoothText`, a pure `@orb/ui/stream` primitive** (`packages/ui/src/stream/`). Streamdown has **no pacing**; an external pacer composes cleanly. `useSmoothText` gives adaptive backlog-drain, **grapheme-cluster safety** (no torn emoji/ZWJ), trailing-partial-word hold-back, hidden-tab flush, reduced-motion passthrough. Pipeline: tokens → `useSmoothText` (reveal cadence + cut-point) → Streamdown (repair + render + fade). Do NOT swap it for AI SDK `smoothStream` (server-side, fixed-delay, cruder).
3. **TTFT affordance → the "Thinking…" shimmer** (`stream/shimmer.tsx`).

The `<speaker>`-tag hold-back lives in `@orb/kit/fix-markdown` (`holdTornSpeaker`) — kept, because orbweaver's chat keeps the `<speaker>`-span wire format (§12.4).

**HONEST RISK — Streamdown's open bugs cluster in code-blocks-while-streaming.** The streaming-time code-block path is its soft spot: fenced blocks that buffer instead of rendering incrementally, Shiki re-highlight flicker, huge blocks freezing the tab, lazy chunks crashing after a deploy. Guards:

1. **Version floor ≥ 2.5** (`packages/ui/package.json`).
2. **The pacer mitigates the re-highlight flicker:** feeding Streamdown word-snapped ~30fps commits, not raw per-token deltas, cuts the churn.
3. **Error boundary around the seal** (`markdown.tsx` `MarkdownErrorBoundary`; white-screen → graceful fallback).
4. **Large-block perf guard** (`markdown.tsx` `MAX_RENDER_LENGTH` whole-input fallback to plain `<pre>`).
5. **Golden-test streaming code blocks** against the flicker/freeze/crash scenarios before chat commits.
