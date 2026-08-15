---
kind: history
status: archived
updated: 2026-08-08
---

# CT-on-vite-8 spike — REFUSED, and CT's vite is now pinned (2026-08-07)

**Question asked:** the tree carries TWO vite majors — vite 8 for the `@orb/client` build, vite 6 bundled
by `@playwright/experimental-ct-core`. Can we collapse them by overriding ct-core's vite to the catalog's
vite 8, and thereby (a) delete the two-vite-versions class of confusion and (b) let `playwright-ct.config.ts`
use vite-8-only options and join the root type program?

**Answer: NO.** vite 8 builds the CT harness bundle successfully and then mounts NOTHING. Owner ruling on
the evidence below (2026-08-07): revert, and PIN CT's vite explicitly rather than leave it to transitive
resolution.

**Method:** the whole CT suite on the override, then a scoped one-file A/B (same spec, same box, same load,
only the vite major differs). Repo: `pnpm-workspace.yaml` `overrides`, `playwright-ct.config.ts`.

## Evidence

| arm | vite | result |
| - | - | - |
| override ON, whole suite | 8.1.2 | 674 specs produced results; **670 reached retry2** — i.e. failing after both retries — starting at the FIRST spec. Run stopped at that point (`EXIT=143`, my SIGTERM); the suite was \~90 min in and every test was burning its full 30s timeout three times. |
| override ON, one file | 8.1.2 | `tests/client/data/query-error-state.ct.tsx` → **2 failed**, exit 1. Both failures are `mount()` → `Test timeout of 30000ms exceeded` at `@playwright/experimental-ct-core/lib/mount.js:45`. |
| override OFF, one file | 6.4.3 | same file → **2 passed (27.9s)**, exit 0. |
| reverted + pinned, one file | 6.4.3 | same file → **2 passed (12.8s)**, exit 0 — the revert is clean. |

**Failure shape: BLANK MOUNT.** The `test-failed-1.png` from the earliest failure
(`reports/ct-results/client-a11y-accessible-nam-70402--panel-is-navigable-by-name-chromium/`, ephemeral —
`reports/` is not durable) is a solid empty page: no component, no error overlay, nothing. Not a
timeout-under-load pattern, not flakes — the harness page loads and the component never mounts.

Reproduce: set `"@playwright/experimental-ct-core>vite": "catalog:"` in `pnpm-workspace.yaml` `overrides`,
`pnpm install`, then
`rm -rf playwright/.cache && npx playwright test -c playwright-ct.config.ts tests/client/data/query-error-state.ct.tsx --reporter=line --retries=0`.

**Diagnosis.** The vite-8 CT build is not merely slower or noisier — it emits a structurally different
bundle. Its own `[PLUGIN_TIMINGS]` block attributes \~72-75% of build time to `playwright:component-index`,
ct-core's own plugin, and the emitted chunking differs sharply from vite 6's (vite 6 emits one \~9 MB
`_ct-stories` chunk; vite 8 splits it into many, largest \~256 kB). `playwright:component-index` is written
against vite 6's Rollup-based build pipeline; Rolldown's is not it, and what survives is a bundle whose
mount wiring is dead. This is why playwright pins its own vite rather than peering it — the harness is
coupled to the bundler's internals, not just its config surface.

## What landed instead

`pnpm-workspace.yaml` `overrides` now carries an EXACT pin, with the re-test condition in its comment:

```yaml
  "@playwright/experimental-ct-core>vite": "6.4.3"
```

`6.4.3` is the version transitive resolution already produced — verified by `pnpm why vite -r` after the
revert install, not assumed. The pin changes no bytes today; it converts an accident of resolution into a
stated decision, so a `@playwright/experimental-ct-*` bump can never move CT's vite silently.

**RE-TEST TRIGGER:** on any playwright bump, check whether ct-core's vite range has moved to `^8`. If it
has, re-run the WHOLE CT suite on it before collapsing to one vite.

`playwright-ct.config.ts` KEEPS `build.rollupOptions` (the `onwarn` advisory filter) — correct for the
bundled vite 6; the `rolldownOptions` migration was contingent on this spike and is not made.

## The prize is NOT claimed — two defect classes stay OPEN

Collapsing to one vite would have closed two standing problems. Both remain open, and neither has another
route today:

1. **The worktree CT-runner two-versions trap** (`[[worktree-ct-runner-resolution]]`) — two vite majors in
   one store is still the ambient condition.
2. **`playwright-ct.config.ts` cannot join the root type program.** `tsconfig.json`'s include list
   deliberately excludes it, and its own comment states the reason and the unblock condition: ct-core
   bundles vite 6, so `ctViteConfig` types collide with our vite-8-typed plugins under
   `exactOptionalPropertyTypes` — "Re-add it the day playwright-ct rides the same vite major." That day is
   NOT today. **That note is still factually correct and was deliberately left unedited.**

## Cost note for whoever revisits this

Three full-suite attempts were consumed getting here, two of them lost to a cause that was not the code:
a long-running suite launched as a tool-managed background task was reaped by the agent's own polling
(each timed-out foreground poll became a new background task, and the manager killed the oldest — the
suite). Both deaths landed at \~93% with `[ELIFECYCLE] Command failed` and no report, which is
INDISTINGUISHABLE from a crash near the end of a real run. Launch a long suite detached
(`setsid nohup … </dev/null &`) with an exit-code file, outside the task manager.
