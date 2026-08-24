---
paths:
  - "tests/**/*.ct.tsx"
  - "tests/e2e/**"
  - "playwright*.config.ts"
---

<!-- Path-scoped rule, split out of `.claude/rules/orchestration.md` on 2026-08-24 (lane
     cb-agent-fleet). These are the traps of the BROWSER tier specifically — component tests, e2e
     specs, and the rendered probes that read them. They only bind an agent inside those files, so
     they load on match rather than costing every lane context at launch. The always-on half (the
     niced invocation, the worker caps, the type-program truth table) is
     `.claude/rules/lane-standing-facts.md`, which points here. -->

# Component tests, e2e and rendered probes

## Running them

- **`pnpm ct:scoped <paths> --workers=2`** — it carries the cache-clear. Never a raw
  `npx playwright test` (it bypasses the nice-19 priority protecting the co-hosted homelab), and never
  the whole-tree `pnpm test:ct` from a lane (that is the orchestrator's instrument on a quiesced tree).
  Run from your worktree via `env -C`, never `cd`.
- **Under multi-lane load the `--workers=2` cap is mandatory** — measured 2026-08-21 at load-avg 170,
  the default worker count timed out EVERY test at `mount()` on pure contention (zero signal), while
  `--workers=2` came back green in 53s. A contention timeout is not a failing test.
- **A CT file nobody NAMED is a file nobody ran.** `pnpm check` is static and `check:structure` never
  executes a CT, so list the CT paths you ran in your floor and in your report, beside their results.
- **Only per-package `pnpm typecheck` owns `tests/**/*.ct.tsx`**, and only `typecheck:tests-dom` owns
  `tests/e2e/` — `types:graph` is a false clean for both. Name the right program (truth table in
  `lane-standing-facts.md`).

## What the browser tier lies about

- **playwright-ct runs PRODUCTION React — StrictMode is inert.** Double-invocation bugs do not
  reproduce here.
- **The CT harness may mount its OWN copy of a global surface** (the Toaster). Assert on the instance
  that carries content, never on a bare slot selector.
- **`route.abort()` defaults to `"failed"`, which makes chromium swap in an ERROR PAGE** — the mounted
  tree disappears and every later assertion passes vacuously (`toBeHidden` on a destroyed DOM).
  `route.abort("aborted")` is the only code that leaves the document standing.
- **A CT must barrier on SETTLED rendered states.** An assertion on a state that exists only while a
  query is in flight passes in isolation (where the flash is catchable) and flakes under contention
  (where it is not) — it verifies nothing either way. A node-side request count (`trpc.count()`) is
  never a browser-side settle.
- **`__orb.queries()` is a CACHE CENSUS, never an in-flight network count.** Any "N parallel queries"
  perf claim owes a network re-derivation before a dedupe is prescribed.
- **A CPU profile's top self-time frame can be the INSTRUMENT** (dev-only tooling). Attribute before
  optimizing; a dev-only frame is a tooling fix, not an app fix.
- **@orb/ui primitives drop `data-testid`** (slot-only seal). ECharts `BarList` is a canvas — text
  assertions speak for the frame, not the bars.
- **Shoot the NARROWEST real production mount, not the story width.** A CT at a narrow mount needs a
  FIXED-width container with `overflow: visible`; a content-sized mount root agrees with the bug.

## Snap and the stage

- **A snap stage's db is whatever its cached dir already holds** (corrected 2026-08-19 — the seed
  copies the dev db only into a FRESH stage dir; a cached stage keeps its old, possibly thin state).
  Verify provenance before using owner-corpus rows as receipts (fresh sha, or probe a known row); when
  unverified, rendered receipts come from CT or live-main instead.
- **The stage band (`:8888`/`:5273`) is ONE pair.** If a sibling holds it, fall back to CT and SAY SO —
  never tear a sibling's stage down. Stage writes land in the stage's own copy; read-only discipline
  still applies to drives.
- **`:5173` serves MAIN, never your worktree** (§L.6). From a lane, use `snap --isolated --ref <sha>`
  or screenshot from the CT browser.
