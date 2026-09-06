# Client dev / agent-introspection tooling

Browser-side seams for debugging, Playwright, `pnpm snap`, and agent browser-driving. All dev-gated
(`IS_DEV` / `import.meta.env.DEV`) and prod-inert unless noted. On every dev load the console prints a
one-line hint pointing here.

## `window.__orb` — the introspection handle (dev only)

Read app state in ONE eval instead of scraping the DOM. `main.tsx` reaches `agent-bridge.ts` only through
the literal `import.meta.env.DEV` dynamic `agent-handles/index.ts` door.

| Call | Returns |
| - | - |
| `__orb.capabilities()` | exhaustive top-level member index with a one-line description for every `OrbDebugHandle` key; this is the discovery door, not a hand-maintained subset |
| `__orb.rings()` | every indexed evidence source with its read spelling, honest lifetime (`checkpoint`, `session`, `server-runtime`, `durable`), and resetability |
| `__orb.resetRing(name)` | reset one checkpoint-safe client evidence ring (`bus-events`, `flags`, `motion`, `renders`, `css-merges`), returning `{ok:true,name}`; unknown or unsafe names return `{ok:false,name,reason}` without mutating evidence |
| `__orb.snap()` | cheap one-call overview: `{ ready, shell, bus, queries, perf, renders, motion, flags }`; motion summarizes recorded evidence without forcing a document-wide animation scan |
| `__orb.css.read()` / `.reset()` | ordered configured-merge receipts since the last checkpoint: input occurrences, governed axis, exact loser → final winner, and output; repeated receipts dedupe while counters retain population. A read before any merge fails loud with `INSTRUMENT ERROR` |
| `await __orb.seed.game({ profile: "d20" \| "freeform", title? })` | create a fresh, fully populated development game through production tRPC writes; returns `{ chatId }`. Open that exact room with `await __orb.nav.openChat(chatId)` — do not guess `latest` after creating an unlisted room |
| `await __orb.rpg()` | active chat's authoritative state as `{ chatId, game, tracker, journal, turnToolCalls }`; read-only through production tRPC APIs |
| `await __orb.pluginLog(ref?)` | no ref: the installed-plugin list `{ id, slug, name, version, status }[]`; a ref (slug or id): that plugin's RUNTIME host.log ring through `plugin.getLog` — including what a floated guest continuation logged between invocations (#806). `{ok:false, reason}` on no match / ambiguity |
| `await __orb.automationFires({ chatId?, ruleId?, limit? })` | the durable automation fire log (`automation_fires`: every dispatch terminal + per-arm `detail`), newest-first, deployment-wide — a same-origin read of `/api/_debug/automation/fires` (admin session or `x-debug-token`); `{ok:false, reason}` carries a refused status |
| `__orb.queries()` | the full TanStack Query cache: `{ key, status, fetch, stale, updatedAt }[]` |
| `__orb.bus()` | chat-bus: `{ live, events }` — live subscription count + the recent canon-event ring |
| `__orb.perf()` | the `orb:*` User Timing measures: `{ name, ms }[]` (app-ready; turn TTFT/latency when wired) |
| `__orb.renders()` | the render heatmap: per-surface `{ id, count, mounts, updates, totalMs, avgMs, maxMs }`, hottest-first |
| `__orb.motion()` | LoAF ring + jank numbers: `{ loafs, cls, observedCls, worstBlocking, worstShift, shifts }`; each attributed shift says whether it followed real input, `__orb.nav`, or virtual-row reconciliation |
| `__orb.animations()` | active animations: `{ id?, target, properties, compositorClean }[]` — `compositorClean:false` (animating a non-transform/opacity/filter prop) = per-frame-layout jank risk |
| `__orb.flags()` | motion flagger records for the current evidence window |
| `__orb.resetEvidence()` | legacy aggregate: clear all five checkpoint-safe rings before a driven checkpoint without resetting app state; bus live-subscription count is deliberately untouched |
| `__orb.motionFlaggersSettled()` | await the dev flaggers' one initial full CSS census before a measured checkpoint; later scans remain incremental |
| `__orb.setMotionAuditDropTrackingPaused(paused)` | Snap `--motion` only: pause duplicate in-page `[drop]` lifetime/report work while its CDP trace owns dropped-frame truth |
| `__orb.shell()` | DOM-derived shell state: active section, panel modes, `chatOpen` |
| `__orb.nav` | dev-only SPA-navigation ACTIONS — see below |
| `__orb.ready` / `.isReady()` | a promise / bool for "hydrated + initial reads settled" |

Example: `preview_eval("__orb.snap()")`, or in DevTools `copy(__orb.renders())`.

## `window.__orb.nav` — SPA navigation actions (dev only)

The app has only 2 URL routes (`/`, `/login`); ALL navigation is client state (active rail section, open
modal, settings category, context tab, open chat — `state/shell-store.ts` + `state/active-chat-store.ts`).
`__orb.nav` drives that state through the SAME store actions the real UI calls (`setActiveSection`,
`openModal`, `openConfigTo`, `setContextTab`, `selectChat`) — no parallel mutation path — so an agent /
`pnpm snap` reaches any surface WITHOUT a click chain. Built at the composition root (`agent-nav/index.ts`,
which may compose `#state`/`#features`/`#data` — the `lib/` floor may not) and injected into
`installAgentDebugHandle`. Every call returns `{ok:true}` or `{ok:false, reason}` — a bad id is a LOUD
refusal, never a silent no-op. ids validate against the canonical tuples (`SECTION_IDS`, `MODAL_SLOT_IDS`,
`CONFIG_GROUP_IDS` — the settings-era `SETTINGS_CATEGORY_IDS`, re-keyed by the config revamp #866 S1).

| Call | Effect |
| - | - |
| `__orb.nav.capabilities()` | return the exact canonical section, modal, config-group, and chat-position vocabularies plus the context-tab ids published by the surface mounted right now |
| `__orb.nav.section(id)` | switch the active rail section (`SECTION_IDS`) |
| `__orb.nav.openModal(slot)` | open a rail modal (`MODAL_SLOT_IDS`) |
| `__orb.nav.openConfig(group, sub?, setting?)` | open the Settings section at a config group (`CONFIG_GROUP_IDS`), optionally scrolled to a subcategory, optionally landing on one setting LEAF — the full `openConfigTo(group, sub?, setting?)` address the `/config?to=group.sub.setting` copy-link grammar also spells. The settings-era `openSettings(category)`, re-keyed #866 S1. REFUSES a `setting` passed without its `sub` (a leaf is addressed through its section) rather than silently landing on the group. The third argument was DROPPED until #1176 — a drive asking for a knob got its section and an `ok:true`. A `sub`/`setting` that names NO real section/leaf REFUSES loudly, naming the nearest real target, once the compose door's config-section registry has loaded (#1638) — validated over a registry `main.tsx` injects lazily (a dynamic `import()` of `compose/config-sections.ts`, never a static one — that graph is the same ~570 kB the #433 boot-eval split keeps out of every chunk); a `sub` asked for BEFORE that load settles refuses naming the race ("config sections not loaded yet") rather than validating vacuously |
| `__orb.nav.contextTab(name)` | *(async)* open the active surface's context panel on a tab named by stable id OR unique visible label. It WAITS for the panel's own publish before resolving (a tabbed surface publishes its ids from a mount effect, so the set is empty for a beat after every navigation — issue #656: validating against that empty set validated vacuously, and ONE call right after `--open-chat` returned `ok:true` while Members stayed mounted, so every one-call probe chain censused the wrong surface). Then it VERIFIES the tab the panel landed on. Five distinguishable refusals: empty name · ambiguous label · unknown name against a published set · no tabs published within 2s · a landing that disagrees with the request |
| `__orb.nav.openChat(idOrTitle)` | *(async)* switch to the Chats section + make a chat active by chat id OR exact display title OR one of the sentinels in `capabilities().chatPositions`: `"first"`/`"latest"` (the LIST's top row = the most-recently-updated LISTED chat) and `"current"` (the ACTIVE room, read off the session pointer with no list query — the one to use right after CREATING a room, since a fresh room is an unlisted husk and `latest` would name a different chat). All three are reserved words: a chat literally titled one of them is reachable by id. The id/title arms resolve against the chat-list query cache, fetching it if cold. REFUSES (`ok:false`) on an AMBIGUOUS title matching >1 chat (pass the id), an empty list, or — for `"current"` — nothing open |
| `__orb.nav.openCharacter(idOrName)` | *(async)* switch to the Characters section + select a character by id OR name — resolves against `character.list`, same store action a library-row click calls (`selectCharacter`). Same ambiguity refusal on a name matching >1 character |
| `__orb.nav.closeModal()` | close any open modal |
| `__orb.nav.panel(name, mode)` | *(async)* write one side panel (`"list"` \| `"context"`) to `"docked"` or `"collapsed"` through the SAME store actions the real chrome calls (`dockListPanel`/`collapseListPanel`, `revealContextPanel`/`hideContextPanel`) — never a bare `setPanelMode`, which is a SILENT no-op in an overlay regime (mobile, narrow-desktop, or CONTEXT's content-constrained auto-overlay — `use-shell-layout.ts`) because the resolve reads the transient `openOverlayPanel` channel there instead of the persisted dock. Then VERIFIES the panel's RENDERED `data-panel-mode` actually reached the request before reporting `ok:true` (the `contextTab` #656 contract). REFUSES when no shell is mounted, an unknown name/mode is passed, or — for a `"docked"` request — the active section declares no such pane at all (the one no-op this bridge cannot route around: an unavailable pane pins the resolve `collapsed` forever) |
| `__orb.nav.focus(on)` | flip the shell's ONE focus flag — `true` hides every panel, `false` restores the section's own saved layout. Regime-free, so it can never no-op |

`pnpm snap` wraps these as `--goto <section|settings:cat|modal:slot>`,
`--open-chat <idOrTitle|first|latest|current>`, `--open-character <idOrName>`, `--context-tab <name>`. They
are INTERLEAVED with the `--click`/`--fill` steps in TRUE argv order — a nav written mid-chain runs
mid-chain, against whatever the preceding steps produced — and a `{ok:false}` reddens the exit. Add `--checkpoint` to reset `__orb` evidence after readiness and scope console/page-error
verdicts to those actions. The JSON keeps the complete boot log under `console` and the interaction-only
window under `evidence`, so neither phase can contaminate or erase the other.

## `data-app-ready` — the readiness wait target (dev + prod)

`app-ready-signal.ts` sets `data-app-ready` on `<html>` once the query cache first goes idle after the
initial reads — SSE subscriptions are NOT queries, so it fires with the chat-bus stream still open. Use
it instead of network-idle, which hangs on the never-idle SSE connection:

- Playwright: `await page.waitForSelector("html[data-app-ready]")`
- snap: waits on it by DEFAULT (graceful — a page that never sets it falls through)
- A 3s grace settles a genuine no-read boot; a 20s ceiling marks the flag `degraded` when reads never
  drain, so a waiter cannot hang or mistake a timeout for a clean settle.
- The grace window starts at ROUTE RESOLUTION, not at install (#145): while the router is still resolving
  a route — including fetching `/`'s lazy `compose/authed-app.tsx` chunk — an idle cache means "the reads
  have not started", never "there are none". snap additionally reds a `settled` flag over an EMPTY query
  cache (`dataless`): the app never reached its data layer, so the capture is a boot placeholder.

## Console channels

Prefixed, low-noise, IS\_DEV-gated — read via `preview_console_logs` or a console-capture transcript.

- **`[bus]`** (`bus-devlog.ts`) — chat-bus subscription lifecycle + live count, each canon event → the
  query keys it invalidated, and a duplicate-invalidate storm alarm. The peer to `[trpc]`.
- **`[trpc]`** (`trpc-devlog.ts`) — tRPC query/mutation round-trips.
- **`[perf]`** (`render-profiler.tsx`) — slow React commits (>12ms, attributed to a wrapped surface).
- **The MOTION FLAGGER PACK** — every channel names an offender and states its budget verdict; each
  dedupes per offender, so a repeating defect prints once. The pull half is `__orb.flags()`; budgets
  live in ONE table, `MOTION_BUDGETS` (`motion-flaggers.ts`), which the CTs assert against.
  - **`[frame]`** / **`[reflow]`** / **`[input]`** (`long-task-tracer.ts`) — a frame over 100ms with its
    costliest script; a script in that frame that BLOCKED on synchronous style/layout, with the forced
    cost and the forcing script (per-script `forcedStyleAndLayoutDuration` — not the frame-level
    `styleAndLayoutStart`, which is >0 on every rendering frame, #432); an interaction over 200ms with
    its target element.
  - **`[anim]`** (`motion-flaggers.ts`) — an animation/transition animating a NON-compositor property,
    caught at start (`__orb.animations()` samples, so it cannot see a finished 130ms transition).
  - **`[drop]`** — a rendered frame over 50ms *while something is animating* (a stutter a user can feel).
  - **`[css]`** — a class on a live element that no CSS rule defines (`snap --dead-css`, live).
  - **`[space]`** — a replaced element with no reserved box: a layout shift that hasn't happened yet.
  - **`[cls]`** (`motion-stats.ts`) — each actionable layout shift over the noise floor, naming what moved. The
    user-equivalent 500 ms after `__orb.nav` remains in `observedCls` and the attributed shift ring but does
    not emit a false “unexpected” warning merely because Chrome saw no physical click. Shifts whose sources
    are all rows inside a known virtualizer are likewise retained with `virtualized: true` but not warned.

## Perf marks (`perf-marks.ts`)

Namespaced `orb:*` `performance.mark`/`measure` helpers. Prod-safe, no-throw. The measures land in
Chrome's User Timing track, are read by Snap's `--perf` arm, and surface via `__orb.perf()`. Place
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
`data-app-ready`) · `pnpm snap --perf` (per-step responsiveness) · `pnpm snap --motion` (smoothness
ground-truth: LoAF/CLS/compositor-clean + CDP dropped-frame %) · `pnpm snap --filmstrip` (a labelled
contact sheet of a transition) · `pnpm snap --design-audit` (the deterministic UI defect scan) ·
`trace:render/tail/fire` · `sse-tap`.
