---
paths:
  - tests/**/*.test.ts
  - tests/support/**
  - tests/contracts/**
---

# Node test suites

Read a suite's result from its own output file. `AGENTS.md` owns the piping rule.

## Fixtures and timeouts

- A `test.extend` fixture's first parameter must be object-destructured. A bare `(ctx)` parameter throws
  `FixtureParseError`.
- A lazily-imported module graph inside a `test.extend` fixture bills its load to the first test's
  `testTimeout`. Move the load to a top-level side-effect import instead (see
  `tests/support/composed-real.ts`).
- `hookTimeout` is not raised by a project's `testTimeout`. Set the hook's own timeout in the file whose
  cost lives in `beforeAll`.
- A test that loops over a whole policy family's proof rows needs a timeout scaled to that loop.

## Resources

Acquire a pooled or leased resource (an admission counter, a lock) immediately before a `try`, and
release it in the matching `finally`. An assertion or throw between acquisition and release strands the
resource and cascades failures into later tests in the same file.

## Mocking

- `vi.mock` binds by resolved module id. A dependency that resolves only inside a sub-package's own
  `node_modules` cannot be mocked from `tests/`; inject it at the composition root instead.
- To observe an injected-op exec frame at compose level, `vi.spyOn` the shared `ServicesResult` object.

## Suite shape

- A `.test.ts` file has no DOM lib. Importing a client feature barrel from one breaks the root tsconfig
  with unrelated DOM errors — use a `.dom.test.ts` instead (see `tooling/src/_shared/test-kinds.ts`).
- A red only proves a defect if the test reads the right observable. Confirm it goes green on a positive
  control before trusting the red.
- Before blaming your change for a failure, run it three ways: full change, a half change isolating the
  suspect boundary, and restored source. An identical failure across all three is inherited.
- `vitest --typecheck` caches its verdict on the spec file and misses edits in a `///`-referenced `.d.ts`.
  Touch the spec, or run cold.

## Preset prose slots

A preset-homed prose slot's Templates-tab reachability comes from a `TEMPLATE_DEFS` row in
`packages/contracts/src/preset/index.ts`, not from slot-id membership. Migrating a slot's home requires
adding the row and fitting the row-label length (`tests/contracts/prose/**`).

## tRPC hand fetches

This stack's tRPC carries no superjson transformer. A hand fetch to `/api/trpc/*` sends the raw input
object, not a `{json: ...}` envelope, or the input silently collapses to defaults.
