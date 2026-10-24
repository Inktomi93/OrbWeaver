---
paths:
  - "tests/**/*.ct.tsx"
  - "tests/e2e/**"
  - "tests/support/browser/**"
  - "playwright*.config.ts"
---

# Browser tests (CT and e2e)

Read the [testkit authoring contract](../../tests/support/README.md) before adding or changing browser tests or helpers.

## Tests run the product

Follow `docs/law/Spine-Testing.md` §9. Call production, derive types, import constants, and mount the real door. Never copy product logic, registries or wire shapes into a test.

The test layers and the rebuild plan are in `.claude/rules/node-tests.md`.

## Running CT

Run `pnpm test:ct <paths>`. Use separate worktrees and distinct `CT_PORT` values for concurrent CT runs.
Run only the named component suites for the changed behavior.

## Assertions

- Apply [D308](../../docs/adr/0308-hardware-scoped-timing-budgets.md) through the shared test-kind capability policy for measurement budgets.
- Assert only on settled rendered state. A node-side tRPC call count does not prove what the browser shows.
- Use `route.abort("aborted")`, never a bare `route.abort()`.
- Assert accessible names with `textContent`, `ariaSnapshot`, or `getByRole(..., { exact: true })`, never
  `innerText` or a raw attribute read. `aria-labelledby` outranks `aria-label`.
- `getComputedStyle` reports the declared value even under `display: none`; suppress the exact property a
  test measures, not the element's display.
- Follow `Spine-Testing.md` §7 for native gallery authoring, execution mode and lifecycle.
- Prove a disabled control with `toBeDisabled` or a computed style, never a click.
- Inside `page.evaluate` or `locator.evaluate`, pass computed values as arguments. The callback runs
  in-browser; a node-side import is `undefined` there with no type error.
- Barrier on the first persisted write before reading state after `mount()`. Reading immediately
  races zustand-persist's rehydrate write, which lands a beat after mount, not on it.

## Layout and viewport

- Mount at the narrowest real production width, in a fixed-width, overflow-visible host.
- `shell.css` switches to the mobile shell under 48rem (768px). Shoot desktop screenshots at 768px or
  wider, or mount narrow components in a fixed-width container instead of a narrow viewport.
- `snap --viewport` emulates size only, with a fine pointer. A tap-target or hit-zone claim needs real
  coarse-pointer touch emulation.

## Stories and seeds

- Stories import client modules through declared `@orb/client/*` doors. Keep shared values in `.ts` helpers.
- Seed first-run state with `addInitScript` before native `mount()` navigates.
- When a gate trigger changes, retire every story that mounts it.
- A lane touching the app shell, the first-run persona gate or the home launcher runs
  `tests/client/features/auth/components/login-pending-join.ct.tsx` and
  `tests/client/features/chat/anchors/join-invite-dialog.ct.tsx`. The orchestrator runs `tests/e2e/smoke.spec.ts`,
  `tests/e2e/corpus-home-launch.spec.ts` and `tests/e2e/corpus-joiner.local.spec.ts` before merging it.

## Instrument facts

- `__orb.queries()` counts query-cache entries, not in-flight requests; verify network activity before
  calling a query count redundant work.
- `__orb.renders()` counts Profiler subtree commits, not component re-renders; compare `avgMs` to `maxMs`
  against mount cost before filing a render-count finding.
- `@orb/ui` primitives carry no `data-testid`; ECharts is canvas. Assert on the surrounding text instead.
- Stage db provenance rules live in `rules/instruments.md`.
- `pnpm bug:reports` lists owner bug reports; the underlying files are gitignored.
- CDP media emulation leaks across tests in a file. `emulateMedia` does not clear a feature it
  never set, so state the full media-emulation state in one call, including `no-preference` for
  features the test doesn't exercise.

## e2e

- Live e2e turns need Playwright's own stack, not the dev stack. The orchestrator stops the dev
  stack; a lane does not stop it.
- The node-side e2e transform loads the full `@orb/client/lib` barrel, including `.tsx` re-exports.
  Import accessible-name builders directly.
- A route interceptor reading a tRPC batch mutation body must read it as an index-keyed dict, not an
  array, or a missing field reads as a silently null request.
