---
kind: review
status: active
updated: 2026-09-05
---

# Work item 1584 mechanical gate conversion

## Scope

Base `d5a6c8e4c` on `codex/gate-tsmorph-standardization`; implementation branch `codex/1584-mechanical-gates`. Fourteen syntax-only, selected-file policies moved directly from the legacy `GateDescriptor` shape to branded `defineGate` descriptors. Every policy is `ordinary`, `error`, invocation-local, and a singleton family. No adapter, dual runtime, private migration script, registry, gate-owned walk/project/cache/parser/marker table/baseline, product violation repair, suppression, shared runtime change, or board/main/push action landed.

`P9` below is the direct union of `@client`, `@ui`, `@server`, `@db`, `@contracts`, `@kit`, `@tooling`, `@tests`, and `@scripts`. The member counts are the old predicate and final `PopulationExpr` over the same 7,006-file current harness corpus.

| Policy | Final population | Old/new members | Proofs flag/pass | Current findings old/new |
| - | - | -: | -: | -: |
| `baseui-render-prop-composition` | `[@client,@ui]` | 1,647/1,647 | 4/4 | 0/0 |
| `bus-on-data-no-store-write` | `@client` under `packages/client/src/data/bus/**` | 11/11 | 2/3 | 0/0 |
| `infra-auth-no-userid` | `@server` under `packages/server/src/infra/auth/**` | 16/16 | 2/3 | 0/0 |
| `membership-fan-guard` | `@server` under `packages/server/src/domain/chat/**` | 133/133 | 2/3 | 0/0 |
| `no-array-literal-querykey` | `@client` | 1,287/1,287 | 2/4 | 0/0 |
| `no-caller-user-id` | `P9`, excluding the gate corpus | 6,751/6,751 | 2/2 | 0/0 |
| `no-external-media-without-gate` | `@client` under `packages/client/src/features/**` | 983/983 | 2/3 | 0/0 |
| `no-layout-context-props` | `[@client,@ui]` | 1,647/1,647 | 3/2 | 0/0 |
| `settings-section-anchored` | `@client`, TSX only | 677/677 | 3/6 | 0/0 |
| `test-factory-contract` | `P9` under authored `tests/support/factories/**` | 11/11 | 3/3 | 0/0 |
| `testid-typed-only` | `@client` | 1,287/1,287 | 3/4 | 0/0 |
| `ui-accname-survives-spread` | `@ui` | 360/360 | 4/8 | 0/0 |
| `no-decorators` | `P9` | 7,006/7,006 | 3/1 | 0/0 |
| `no-if-is-group` | `P9` minus tests/tools/scripts and test/spec basenames | 4,252/4,252 | 4/4 | 0/0 |

## Differential verdict

All 89 final proof fixtures pass the final policy runtime. The `d5a6c8e4c` detectors also pass those same expanded fixture maps. Every old/new population set is byte-identical and every current-corpus finding set remains empty with zero old/new tool errors.

Declared boundaries are now executable fixtures: computed/quoted property keys, JSX spreads, inherited/intersection props, member/namespace components, shadowed bindings, decorator positions, `satisfies`/parentheses, arrow factories, resolved constants, local aliases, wrapper calls, and caller-spread ordering. `ui-accname-survives-spread` preserves its conservative treatment of a direct props parameter typed with `Omit`; it does not add a gate-local type parser.

Three intentional metadata deltas are classified:

- Owner ruling renamed `bus-onData-no-store-write.ts` and its id/family to `bus-on-data-no-store-write`; detection, message, fix, population, and finding count are unchanged.
- The bus policy now anchors `.setState(` at the actual dot in the parent call instead of the legacy receiver-start coordinate that claimed a token absent at its offset.
- `test-factory-contract` now anchors `makeUser` at its actual line-1 column-17 token instead of the legacy line-1 column-1 coordinate.

## Rename sweep

The bus rename changed only its gate module plus exact coupled source/test/config sites: the sole Biome filename-convention override was deleted; `check-gates.int` dropped its uppercase-name exception and narrowed three output regexes; the spelling-twins baseline key and planted-fixture label moved; and `use-orb-socket.ts` cites the final id. A literal sweep finds no old name under `packages`, `tooling`, `tests`, `.github`, or root config files, and no `docs/catalog/**` hit.

Active documentation still naming the historical id is outside this lane's source/test/config fence: `docs/design/962-blanket-suppression-control-plane.md`, `docs/design/plugin-ui-plane.md`, `docs/reviews/gate-runtime/simple-visitors-a-m.md`, `docs/reviews/gate-runtime/shared-semantic-readers.md`, `docs/law/UI-Primitives-and-Reuse.md`, `docs/law/Core-Enforcement-Active-Gates.md`, `docs/law/ui-package-design.md`, `docs/law/UI-Gates-and-Lessons.md`, and `docs/law/client-architecture-lockdown.md`. Proposed and frozen-history references also remain. The parent cutover/doc lane owns those bytes and any catalog re-attestation.

## Verification receipts

- Final policy conformance: 14 policies, 89 proofs, zero failures, exit 0.
- Legacy detector differential: all expanded proof maps pass; current-corpus populations/findings/tool errors match exactly, exit 0.
- `pnpm test:scoped tests/tooling/verify/lib/gate-contract.test.ts tests/tooling/verify/lib/policy-loader.test.ts tests/tooling/verify/lib/policy-pass.test.ts tests/tooling/verify/ops/policy-conformance.test.ts --maxWorkers=4`: 4 files and 52 tests pass, zero type errors.
- `node scripts/ts7.cjs --noEmit -p tooling/tsconfig.json`: exit 0.
- Scoped Biome over all 18 existing changed files: exit 0.
- Scoped ESLint over the 16 changed TypeScript files: exit 0.
- `pnpm exec depcruise packages tooling --config .dependency-cruiser.cjs`: 4,512 modules and 25,780 dependencies, zero violations, exit 0.
- `git diff --check`: exit 0.
- Fresh cold review independently re-ran all 89 proofs, the 7,006-file population/current-corpus differential, focused contract inspection, tooling types, scoped Biome, and diff checks; no actionable findings.

## Explicit intermediate-red limits

- `pnpm gate:contract` moves from 1,489 findings at `d5a6c8e4c` to 1,461 after this conversion, a reduction of 28 legacy-field findings. The residual 14 `descriptor-wrapper` findings are a known temporary-census defect: `gate-contract.ts` recognizes `defineGate` only from `contract/gate.ts`, while the sole final brand is exported from `contract/policy.ts`. The parent owns that exact seam; this lane does not patch it.
- `pnpm typecheck:graph` remains red because legacy render/scoped tests still combine `no-caller-user-id` with `GateDescriptor` and access legacy fields. This is expected on the direct, no-adapter atomic-migration branch.
- `gate-spelling-twins.int.test.ts`, `check-gates.int`, `gate-conformance.int`, and `check:structure` still enter through the legacy all-corpus loader. They cannot run across the mixed corpus before atomic cutover; no compatibility descriptor was added.
- This new report intentionally has no catalog/receipt edit in this lane. The parent doc lane owns the catalog entry and re-attestation.
