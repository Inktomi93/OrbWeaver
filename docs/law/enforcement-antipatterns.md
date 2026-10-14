---
kind: law
status: active
updated: 2026-10-14
---

# Enforcement antipattern catalog

Every antipattern the audits found has a class, a detector and a burn-down item. A detector is a structural gate in [Core-Enforcement-Active-Gates.md](Core-Enforcement-Active-Gates.md). A hit either fails the build or carries an explicit `@orb-waive` marker that names its burn-down item.

## How to use it

- Run `pnpm ast antipatterns` for the whole tree, or `pnpm ast antipatterns --scope <dir>` for one directory. It runs every detector below in one structure pass and prints the hits by class, waived or not. Exit 1 means an unwaived hit or a stale or misplaced marker. A waiver-budget alarm prints as a `budget` line and does not fail the command: the budget rows are measured at the application scope the structure barrier judges, and this pass also reads the tooling suites.
- The class-to-gate table the command runs is `ANTIPATTERN_CLASSES` in `tooling/src/ast/ops/antipatterns.ts`. Change it and this page together.
- A waived hit is debt, not permission. Fix it under its burn-down item, then delete the marker. The waived count per gate only falls.
- A new hit with no marker fails. Fix it; do not add a marker for new code.

## Catalog

| Pattern | Class | Example | Why it rots | Detector | Burn-down |
| - | - | - | - | - | - |
| Shape that copies a contract | `contract-copy` | `interface CommandRow { id; name; label; enabled }` beside the contract `PluginCommandView` | A renamed or retyped contract field still compiles on both sides, and the copy reads `undefined` | `contract-structural-copy`, `no-inline-wire-interface`, `no-inline-domain-interface`, `no-inline-package-interface`, `no-inline-types`, `contract-derives-not-respells`, `test-hand-shape` | the legacy test rebuild |
| Copied production function | `copied-logic` | a test helper `pidAlive` with the body of an exported production `pidAlive` | The copy keeps passing when the production rule changes | `test-production-clone` | [0958](../work/0958-server-test-composition-root.md) |
| Oversized test file | `oversized-test` | a CT file that proves a whole surface in one review unit | Repeated setup and unrelated concerns hide the case that broke | `test-file-size` | the monolith splits in the [test-mirror plan](../plans/test-mirror/design.md) |
| Boundary read without a parse | `unparsed-boundary` | `(await res.json()) as ChatImportResult`; `row.manifest.capabilities` off a `$type<PluginManifest>` column | The cast states what the writer meant, not what arrived; a server change or an old row reaches the domain unvalidated | `wire-json-parsed-at-consumer`, `json-column-read-parsed`, `trpc-input-declarations`, `zod-output-twin-parity` | the gate's waiver budget |
| Re-spelled constant or union | `respelled-constant` | `data-testid="composer-input"` in a story; `z.enum(["a", "b"])` beside the canonical tuple | The copy keeps the old value when production renames it, and the test or selector silently stops matching | `no-inline-union-alias`, `no-inline-union-redecl`, `testid-typed-only`, `testid-typed-only-stories` | the legacy test rebuild, the legacy test rebuild |
| Cast or double cast | `cast` | `value as never`; `raw as unknown as ChatId` | The cast switches the type checker off at the one place it would catch a drift | `no-loose-id-cast`, `no-mint-via-cast`, `no-test-fabrication` | the legacy test rebuild |
| Hand-forged id | `hand-forged-id` | `chatId: string`; `"chat_01abc" as ChatId` | A bare or literal id accepts every other brand and every malformed value | `no-raw-id`, `brand-in-name-position`, `typeid-prefix-boundary`, `no-fake-disabled-id` | the gate's waiver budget and the legacy test rebuild |
| Fixture production cannot produce | `impossible-fixture` | an indexing state no verb writes; an `unknown` fixture export | The test proves behaviour for a state the product never reaches | `no-opaque-test-fixture`, `test-factory-contract`, `test-determinism` | [0959](../work/0959-one-builder-per-shape-and-one-golden-corpus.md) |
| Mock of our own code | `mock-of-own-code` | `vi.mock("@orb/server/domain/chat")` | The mock keeps the old contract when the module changes, so the test passes against code that no longer exists | `test-mock-doctrine` | the legacy test rebuild |
| Copied door list | `copied-door-list` | a CT harness that registers one tool renderer where production registers two | The harness drifts from the production registry and the story mounts a product that does not ship | `ct-config-mirror-parity` | none |
| File-name-only mirror | `file-name-mirror` | a test file at the mirrored path that never imports its module | The file proves only that a file exists, not that the module is exercised | `test-layout`, `test-reach`, `test-presence-client` | the legacy test rebuild |
| One-shot live read | `one-shot-live-read` | `expect(await locator.textContent()).toBe(…)` in a CT | A single read races the render and flakes or passes on a stale frame | `ct-no-oneshot-live-read-assert` | the legacy test rebuild |
| Swallowed failure | `swallowed-failure` | `catch {}` around a write | The failure disappears and the caller reads success | `caught-failure-ownership` | the gate's waiver budget |
| Unscoped owner read | `unscoped-owner-read` | a query by id with no owner predicate | One tenant can read or write another tenant's row | `owner-scoped-reads`, `owner-scoped-writes` | the gate's waiver budget |
| Superseded platform spelling | `superseded-spelling` | `new Promise((r) => setTimeout(r, ms))` | A second spelling of a platform primitive drifts from the house one | `platform-spellings` | the legacy test rebuild |
| Vanity alias | `vanity-alias` | `import { seedUser as makeUser }` | One symbol under two names hides its origin from search and from the next reader | `no-vanity-alias` | the legacy test rebuild |

## Patterns with no detector yet

These patterns have no gate. Each names the item that owns the detector or the cleanup.

| Pattern | Example | Why it rots | Owner |
| - | - | - | - |
| Copied production query or rule that drifted from its source | a harness that re-implements a compose closure without its owner scope | The copy drops a guard the product keeps, so the test passes on behaviour production refuses. `test-production-clone` sees only an exact copy of an exported body | [0958](../work/0958-server-test-composition-root.md) |
| Test that asserts its own literal | a contract test that builds a fixture and asserts the same fixture back | It tests nothing, so it stays green through any change | the legacy test rebuild |
| Stale golden | a CT golden captured from a state production no longer renders | It pins an obsolete output and blocks the correct one | [0959](../work/0959-one-builder-per-shape-and-one-golden-corpus.md) |
