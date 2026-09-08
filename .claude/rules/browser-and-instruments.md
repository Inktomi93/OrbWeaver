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
- **Two `ct:scoped` runners in ONE worktree are REFUSED (#1581, 2026-09-05):** each invocation builds in its own
  `.cache/ct/build-<pid>-<ms>` (handed to playwright-ct via `ORB_CT_CACHE_DIR` → `use.ctCacheDir`) and holds
  `.cache/ct/runner.lock`, so a second runner exits 2 (`CT RUNNER BUSY`) naming the first's pid; a dead
  holder's lock is stolen with a printed note. Load for a flake proof still comes from a DIFFERENT worktree,
  and that worktree needs its own `CT_PORT` — the CT vite port is box-wide.
- **The CT summary reporter is TRUSTED** (#1006 cleared it by reproduction; the counting is pure and
  pinned by `tooling/src/verify/ops/ct-run-tally.ts` + its test). The old "pass `--reporter=list` until
  the summary is fixed" interim rule is RETIRED — an inverted count today means a cache clobber, i.e. two
  different runs.
- **A CT file nobody NAMED is a file nobody ran.** `pnpm check` is static and `check:structure` never
  executes a CT, so list the CT paths you ran in your floor and in your report, beside their results.
  **The route CTs have no area owner, so this rule is their owner (#1644, 2026-09-05):** a lane touching
  app-shell composition, the first-run persona gate, the home launcher, or an ambient-route feed runs
  `tests/client/routes/app-root.ct.tsx` + `tests/client/routes/route-pending.ct.tsx` — six client folds
  shipped with the first one 4/6 red because no brief listed it. A gate-TRIGGER change retires every STORY
  that mounts the gate; `pnpm ast refs` cannot see a story that never imports the component.
- **Typecheck the native owners, not a guessed nearest config.** `pnpm typecheck` discovers every runnable
  program; scoped verification passes every affected program as repeated `--config` arguments. This is
  what reaches CT and e2e roots in their actual compiler worlds (truth table in `lane-standing-facts.md`).

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

- **A snap stage's db is whatever its cached dir already holds** (the seed copies the dev db only into a
  FRESH stage dir), so verify provenance before using owner-corpus rows as receipts; when unverified,
  rendered receipts come from CT or live-main instead.
- **The stage band (`:8888`/`:5273`) is ONE pair** — if a sibling holds it, fall back to CT and SAY SO;
  never tear a sibling's stage down. Stage mechanics: the `snap-driving` skill §8.
- **`:5173` serves MAIN, never your worktree** (§L.6). From a lane, use `snap --isolated --ref <sha>`
  or screenshot from the CT browser.

## The owner's own bug reports

- **`pnpm bug:reports` lists what the owner captured with the dev top-rail bug button** — each report is a
  route + browser + appearance snapshot, every `__orb` census, a console-error ring, and the server's
  flight-recorder tails at that instant, stamped with the sha + dirty flag it happened on. `pnpm
  bug:reports <id-or-unique-prefix>` prints one. **You will not find these by grepping**: they are
  gitignored per the #1095 contract (raw session evidence, never committed), so the script name is the only
  pointer that exists — check it when investigating anything the owner reported by hand.
