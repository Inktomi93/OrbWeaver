# 1041 shard s4-layout-tests-1: layout gates to runtime tests

Target tool: runtime-test. Gates: client-structure, feature-owns-definition, feature-structure, package-layout, server-layout.
All five are done. Each gate module, its suite cases, its liveness arm and its tree-id scaffolding are deleted in one commit.

## Successors

| Gate | Successor test |
| - | - |
| server-layout, feature-structure | `tests/server/layout.suite.test.ts` |
| client-structure, feature-owns-definition | `tests/client/feature-layout.suite.test.ts` |
| package-layout | `tests/kit/package-layout.suite.test.ts` |

The tests sit under `tests/<pkg>/`, so they run in per-push Node CI. The gates ran in the per-commit static tier, so the cadence moves from commit to push.
Every test walks the real tree with `readdirSync` and asserts a non-empty population (for example `chat` is a domain and a feature), so a moved tree cannot pass by listing nothing.
The mustFlag and mustPass rows are ported as synthetic trees through the same function the real-tree test uses.

## Per-gate records

### server-layout

- parity: 3 mustFlag / 1 mustPass ported, 0 lost.
- plant: `packages/server/src/zz-stray.ts`; `pnpm test:scoped tests/server/layout.suite.test.ts` exit 1, `expected [ 'illegal zz-stray.ts' ] to deeply equal []`.
- retired with the gate, not claims: the five resource-refusal pins (missing, malformed or empty manifest or tree). They test the gate runtime's population refusal. `readdirSync` throws on a missing tree, and the manifest was declared only as the finding anchor.
- deleted: `tooling/src/verify/gates/server-layout.ts`, `tests/tooling/verify/gates/resource-layout-wave-1.suite.test.ts`, its arm in `_liveness/resources.ts`.
- `tests/tooling/verify/ops/structure-corpus.suite.int.test.ts` borrowed `server-layout` as the missing-resource subject. It now plants its own hard resource policy over the `docs` tree, in the same style as its planted warning policy (11 tests green).

### feature-structure

- parity: 3 mustFlag / 1 mustPass ported, 0 lost. The stale-allowlist arm (7 findings) is ported exactly.
- retired artefact: the real-tree anchor guard (stale arms silent unless a `chat` domain exists). The native test runs the stale arm on the real tree always and on a synthetic tree directly.
- plant: `packages/server/src/domain/chat/zz-loose.ts`; same command, exit 1, `expected [ 'chat: loose zz-loose.ts' ] to deeply equal []`.
- deleted: `tooling/src/verify/gates/feature-structure.ts`, `tests/tooling/verify/gates/resource-layout-wave-2.suite.test.ts`, its arm in `_liveness/resources.ts`.

### package-layout

- parity: 3 mustFlag / 2 mustPass ported, 0 lost. The predicate stays `.ts` only: `packages/client/src/main.tsx` is a legal loose `.tsx`.
- grants: none existed (`rg` over `reviewed-grants*.ts` and `waiver-budget.ts` finds no row). The three mustFlag rows carried a `grant:` field proving a grant could not open the door. The native test has no grant door at all.
- plant: `packages/kit/src/zz-loose.ts`; `pnpm test:scoped tests/kit/package-layout.suite.test.ts` exit 1, `expected [ 'kit/zz-loose.ts' ] to deeply equal []`.
- deleted: `tooling/src/verify/gates/package-layout.ts`, wave-1 suite, its arm in `_liveness/multi-root-b.ts`.

### client-structure

- parity: 9 mustFlag / 7 mustPass ported, 0 lost. Rule 7 keeps the exact `OUTER_CONTAINER` regex over the real surface text, so a comment or string match behaves as before.
- plant: `packages/client/src/features/chat/zz-stray.ts`; `pnpm test:scoped tests/client/feature-layout.suite.test.ts` exit 1, `stray-root: packages/client/src/features/chat/zz-stray.ts`.
- deleted: `tooling/src/verify/gates/client-structure.ts`, wave-2 suite, its arm in `_liveness/client-ui.ts`.

### feature-owns-definition

- parity: 2 mustFlag / 4 mustPass ported, 0 lost.
- plant: `packages/client/src/features/zzorphan/lib/helper.ts`; same command, exit 1, `expected [ 'zzorphan' ] to deeply equal []`.
- deleted: `tooling/src/verify/gates/feature-owns-definition.ts`, wave-1 suite, its arm in `_liveness/resources.ts`.

## Shared scaffolding

- Retired authored-tree ids `server-domain` and `client-feature` from `AUTHORED_TREE_PATHS` (`tooling/src/verify/contract/resource-tree.ts`) and from the table in `tests/tooling/verify/ops/resource-tree.test.ts`. ast-grep over `tests/tooling` and `tooling` (2544 ts files, 3 tsx files) finds no `authoredTree("server-domain"|"client-feature")` reader outside the three deleted gates. `server` and `packages` stay: `db-structure-producer-home`, `sanctioned-css-homes` and `dangling-ref-citations` read them.
- Waivers and grants: `@orb-waive` markers 0, reviewed-grant rows 0, waiver-budget rows 0 for all five ids. Nothing was copied or added.
- Docs: nine `docs/law` files, `packages/client/src/features/README.md` and fifteen product comments now point at the new tests. ADRs 0015, 0070, 0117, 0145 and 0220 keep the old names; ADRs are immutable.
- Left for the owner of those files: comments in `sanctioned-css-homes.ts`, `playwright-css-topology.ts`, `css-selector-has-a-writer.ts`, `css-selector-writers.ts`, `css-home-topology.ts`, `seed-theme-ink-contrast.ts`, `policy-proof-expectations.ts` and `policy-soundness.ts` still cite `server-layout` or `client-structure.ts` as precedent prose. They are other shards' files.

## Owed to primary

- `pnpm check:ledgers-fresh`: the active-gates catalog (`docs/law/Core-Enforcement-Active-Gates.md`) and population ledgers still list the five gates.
- One whole-tree `check:structure` on the merged tree: it runs the real-corpus liveness runner and the policy roster, which this shard did not run.
- No `eslint.config.js` edit, so no `lint:eslint-scoped` is owed.
