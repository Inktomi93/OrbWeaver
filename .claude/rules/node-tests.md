---
paths:
  - tests/**/*.test.ts
  - tests/support/**
  - tests/contracts/**
---

# Node test suites

Read the [testkit authoring contract](../../tests/support/README.md) before adding or changing Node tests or helpers.

Read a suite's result from its own output file. `AGENTS.md` owns the piping rule.

## Tests run the product

Follow `docs/law/Spine-Testing.md` §9. Call production, derive types, import constants, and mount the real door. Never copy product logic, registries or wire shapes into a test.

## Test layers and the rebuild

`docs/plans/test-foundation/design.md` owns the layer split and the rebuild order. Each layer answers its own question:

| Layer | Question |
| - | - |
| e2e | user flows and every wire |
| CT | component behaviour and states |
| server integration | domain logic and permissions on the composition root |
| unit | pure logic in `@orb/kit` and `@orb/contracts` |

- Retrofit work on a fake-heavy server harness stops. Those rows move to the rebuild.
- Complete foundation qualification remains open; the plan's work items own its current state.
- The external legacy source at `/home/inktomi/inktomi-stack/development/orbweaver-legacy-tests-2026-10-21` is reference-only. It is not typechecked or run by this repository.
- Run named Node suites with `pnpm test <paths>` and component suites with `pnpm test:ct <paths>`.
- For testkit import changes, run native dependency-cruiser on the changed helper entries. Typechecking alone does not prove world purity.

## Fixtures and timeouts

- A `test.extend` fixture's first parameter must be object-destructured. A bare `(ctx)` parameter throws
  `FixtureParseError`.
- A lazily-imported module graph inside a `test.extend` fixture bills its load to the first test's
  `testTimeout`. Move the load to a top-level side-effect import instead (see
  `tests/support/node/composed-real.ts`).
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
  with unrelated DOM errors — use a `.dom.test.ts` instead (see `tooling/src/floor/testing/test-kinds.ts`).
- A red only proves a defect if the test reads the right observable. Confirm it goes green on a positive
  control before trusting the red.
- Before blaming your change for a failure, run it three ways: full change, a half change isolating the
  suspect boundary, and restored source. An identical failure across all three is inherited.
- Native `pnpm typecheck` owns `.test-d.ts` assertions. Runtime Vitest does not run type tests.

## Preset prose slots

A preset-homed prose slot's Templates-tab reachability comes from a `TEMPLATE_DEFS` row in
`packages/contracts/src/preset/index.ts`, not from slot-id membership. Migrating a slot's home requires
adding the row and fitting the row-label length (`tests/contracts/prose/**`).

## tRPC hand fetches

This stack's tRPC carries no superjson transformer. A hand fetch to `/api/trpc/*` sends the raw input
object, not a `{json: ...}` envelope, or the input silently collapses to defaults.
