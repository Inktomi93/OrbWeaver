# Client dev / agent-introspection tooling

Browser-side seams for debugging, Playwright, `pnpm snap`, and agent browser-driving. All dev-gated
(`IS_DEV` / `import.meta.env.DEV`) and prod-inert unless noted. On every dev load the console prints a
one-line hint pointing here.

## `window.__orb` — the introspection handle (dev only)

Read app state in ONE eval instead of scraping the DOM. Installed from `main.tsx` (`agent-bridge.ts`).

| Call | Returns |
| --- | --- |
| `__orb.snap()` | one-call overview: `{ ready, shell, bus, queries, perf, renders, motion }` |
| `__orb.queries()` | the full TanStack Query cache: `{ key, status, fetch, stale, updatedAt }[]` |
| `__orb.bus()` | chat-bus: `{ live, events }` — live subscription count + the recent canon-event ring |
| `__orb.perf()` | the `orb:*` User Timing measures: `{ name, ms }[]` (app-ready; turn TTFT/latency when wired) |
| `__orb.renders()` | the render heatmap: per-surface `{ id, count, mounts, updates, totalMs, avgMs, maxMs }`, hottest-first |
| `__orb.motion()` | LoAF ring + jank numbers: `{ loafs: { startTime, duration, blockingDuration, styleAndLayoutStart, scripts }[], cls, worstBlocking, worstShift }` — `styleAndLayoutStart>0` = style/layout ran in-frame (jank tell) |
| `__orb.animations()` | active animations: `{ id?, target, properties, compositorClean }[]` — `compositorClean:false` (animating a non-transform/opacity/filter prop) = per-frame-layout jank risk |
| `__orb.shell()` | DOM-derived shell state: active section, panel modes, `chatOpen` |
| `__orb.nav` | dev-only SPA-navigation ACTIONS — see below |
| `__orb.ready` / `.isReady()` | a promise / bool for "hydrated + initial reads settled" |

Example: `preview_eval("__orb.snap()")`, or in DevTools `copy(__orb.renders())`.

## `window.__orb.nav` — SPA navigation actions (dev only)

The app has only 2 URL routes (`/`, `/login`); ALL navigation is client state (active rail section, open
modal, settings category, context tab, open chat — `state/shell-store.ts` + `state/active-chat-store.ts`).
`__orb.nav` drives that state through the SAME store actions the real UI calls (`setActiveSection`,
`openModal`, `openSettingsTo`, `setContextTab`, `selectChat`) — no parallel mutation path — so an agent /
`pnpm snap` reaches any surface WITHOUT a click chain. Built at the composition root (`routes/agent-nav.ts`,
which may compose `#state`/`#features`/`#data` — the `lib/` floor may not) and injected into
`installAgentDebugHandle`. Every call returns `{ok:true}` or `{ok:false, reason}` — a bad id is a LOUD
refusal, never a silent no-op. ids validate against the canonical tuples (`SECTION_IDS`, `MODAL_SLOT_IDS`,
`SETTINGS_CATEGORY_IDS`).

| Call | Effect |
| --- | --- |
| `__orb.nav.section(id)` | switch the active rail section (`SECTION_IDS`) |
| `__orb.nav.openModal(slot)` | open a rail modal (`MODAL_SLOT_IDS`) |
| `__orb.nav.openSettings(category)` | open Settings at a category (`SETTINGS_CATEGORY_IDS`) |
| `__orb.nav.contextTab(name)` | ask the active surface's context panel to open a named tab |
| `__orb.nav.openChat(idOrTitle)` | *(async)* switch to the Chats section + make a chat active by chat id OR exact display title — resolves against the chat-list query cache, fetching it if cold. REFUSES (`ok:false`) on an AMBIGUOUS title matching >1 chat — pass the id |
| `__orb.nav.openCharacter(idOrName)` | *(async)* switch to the Characters section + select a character by id OR name — resolves against `character.list`, same store action a library-row click calls (`selectCharacter`). Same ambiguity refusal on a name matching >1 character |
| `__orb.nav.closeModal()` | close any open modal |

`pnpm snap` wraps these as `--goto <section|settings:cat|modal:slot>`, `--open-chat <idOrTitle>`,
`--open-character <idOrName>`, `--context-tab <name>` (run before the regular steps; a `{ok:false}` reddens
the exit).

## `data-app-ready` — the readiness wait target (dev + prod)

`agent-bridge.ts` sets `data-app-ready` on `<html>` once the query cache first goes idle after the
initial reads — SSE subscriptions are NOT queries, so it fires with the chat-bus stream still open. Use
it instead of network-idle, which hangs on the never-idle SSE connection:

- Playwright: `await page.waitForSelector("html[data-app-ready]")`
- snap: waits on it by DEFAULT (graceful — a page that never sets it falls through)
- A 3s self-fallback means it never hangs.

## Console channels

Prefixed, low-noise, IS_DEV-gated — read via `preview_console_logs` or a console-capture transcript.

- **`[bus]`** (`bus-devlog.ts`) — chat-bus subscription lifecycle + live count, each canon event → the
  query keys it invalidated, and a duplicate-invalidate storm alarm. The peer to `[trpc]`.
- **`[trpc]`** (`trpc-devlog.ts`) — tRPC query/mutation round-trips.
- **`[perf]`** (`render-profiler.tsx` + `long-task-tracer.ts`) — slow commits (>12ms, attributed to a
  wrapped surface) + long tasks (>100ms main-thread blocks).

## Perf marks (`perf-marks.ts`)

Namespaced `orb:*` `performance.mark`/`measure` helpers. Prod-safe, no-throw. The measures land in
Chrome's User Timing track, are read by the `perf-meter` probe, and surface via `__orb.perf()`. Place
`perfMark`/`perfMeasure` at critical-path points (app-ready is done; the chat turn chain — send →
first-token → complete — is the intended next consumer, placed in the impure event-hook layer, NEVER
the pure `applyChatBusEvent` reducer).

## Render heatmap (`render-stats.ts` + `render-profiler.tsx`)

`<RenderProfiler id="…">` wraps a surface in React's `<Profiler>`; every commit feeds `render-stats`,
read via `__orb.renders()`. `RegionAnchor` wraps each shell region (`region:content|list|context`), so
the heatmap shows per-region render frequency + cost out of the box. Wrap more composition points
(message list, panel roots) to grow granularity — use SPARINGLY (per-row wrapping drowns the signal).
This is the DATA behind React DevTools' visual "highlight updates"; the extension's overlay itself is
not page-hookable for an agent.

## Framework devtools

`lib/dev-tools.tsx` mounts the TanStack Query + Router panels (constant-folded out of prod). All 11
Zustand stores carry the `devtools` middleware → visible in Redux DevTools.

## Probes (`scripts/probes/`, run against `pnpm stack`)

`pnpm snap <route>` (headless screenshot + aria/console/network/deadcss; default-waits on
`data-app-ready`) · `pnpm perf-meter` (per-step responsiveness) · `pnpm motion-audit` (smoothness
ground-truth: LoAF/CLS/compositor-clean + CDP dropped-frame %) · `pnpm record` (gifs) ·
`trace:render/tail/fire` · `sse-tap`.
