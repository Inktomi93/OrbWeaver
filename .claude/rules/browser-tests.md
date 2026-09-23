---
paths:
  - "tests/**/*.ct.tsx"
  - "tests/e2e/**"
  - "tests/support/browser/**"
  - "playwright*.config.ts"
---

# Browser tests (CT and e2e)

## Running CT

Run `pnpm test:ct <paths>`. Never invoke `playwright test` directly and never run the whole tree from a
lane. A second CT run in the same worktree refuses with `CT RUNNER BUSY`; prove a flake from a separate
worktree with its own `CT_PORT`.

## Assertions

- Assert only on settled rendered state. A node-side tRPC call count does not prove what the browser shows.
- Use `route.abort("aborted")`, never a bare `route.abort()`.
- Assert accessible names with `textContent`, `ariaSnapshot`, or `getByRole(..., { exact: true })`, never
  `innerText` or a raw attribute read. `aria-labelledby` outranks `aria-label`.
- `getComputedStyle` reports the declared value even under `display: none`; suppress the exact property a
  test measures, not the element's display.
- Playwright's production build makes `import.meta.env.DEV` false in every CT; mount dev-gated components
  directly. `react-profiler` `onRender` never fires under CT; prove settling by sampling rendered geometry,
  and prove a disabled control with `toBeDisabled` or a computed style, never a click.
- StrictMode double-invocation does not reproduce under CT, which runs production React.
- Inside `page.evaluate` or `locator.evaluate`, pass computed values as arguments. The callback runs
  in-browser; a node-side import is `undefined` there with no type error.
- A CT spec's node side cannot import a value from a client `.tsx` file: playwright-ct rewrites named
  component imports into stubs and silently collects zero tests. Put values a CT imports in a
  zero-import `.ts` file.
- `mount()` allows one call per test. Cover several theme or state variants in one mount with
  suffixed panes, not a loop of mounts.
- Barrier on the first persisted write before reading state after `mount()`. Reading immediately
  races zustand-persist's rehydrate write, which lands a beat after mount, not on it.

## Layout and viewport

- Mount at the narrowest real production width, in a fixed-width, overflow-visible host.
- `shell.css` switches to the mobile shell under 48rem (768px). Shoot desktop screenshots at 768px or
  wider, or mount narrow components in a fixed-width container instead of a narrow viewport.
- `snap --viewport` emulates size only, with a fine pointer. A tap-target or hit-zone claim needs real
  coarse-pointer touch emulation.

## Stories and seeds

- A `_ct-stories` module exports only components. Stories import through `@orb/client/*` aliases.
- Seed first-run state with `addInitScript` and `page.reload()`.
- A lane touching app-shell, the first-run persona gate, the home launcher, or the ambient-route feed runs
  `app-root.ct.tsx` and `route-pending.ct.tsx`.
- When a gate trigger changes, retire every story that mounts it.

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
