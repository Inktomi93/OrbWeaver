# 1041 shard s2-eslint-plugin-rule-1

Four gates moved to rules in the `orb` plugin in `eslint.config.js`. No dependency added, no type information used.
Two rules are ordinary (RESTRICTIONS entries), two are HARD (explicit `hardConfig` blocks, no inline-disable door).

## evaluate-no-scope-capture (ordinary, `orb/evaluate-no-scope-capture`, @tooling) - done, D328 partial coverage
- parity: 3 mustFlag / 8 mustPass in the gate; 2 mustFlag + 8 mustPass ported, 1 lost.
- Lost claim: an imported by-reference callback (`page.evaluate(importedFn)`) whose declaring module closes over its own
  module-scope binding (mustFlag[2]). A per-file rule cannot parse the declaring file, and an import binding may be a script
  string (6 live sites pass imported script strings, so refusing every import is a false positive). Also dropped: the gate's
  TOOL ERROR on an unresolved runtime identifier. Both accepted under D328 ("retained-unqualified").
- Module scope means no function boundary between the binding and the file (`isModuleScoped`), so a top-level block or
  loop binding captured by the callback is flagged like the gate's `isModuleScopeDeclaration`; two ported rows prove it.
- Live census: 1604 tooling/src files, 0 findings; the 5 by-reference callbacks are all declared in the calling file.
- Divergences: an imported binding used inside an inline callback is now a finding (the gate tool-errored on it);
  enclosing-function locals are still not claimed (the gate did not claim them); computed `["evaluate"]` and `?.evaluate` are covered.
- Waivers: 0 live. The 5 markers were gate fixtures/tests and left with them.

## ct-story-single-import (HARD, `orb/ct-story-single-import`, tests CT files, legacy excluded) - done
- parity: 6 mustFlag / 8 mustPass ported, 0 lost. The duplicate-specifier arm is expressed natively (the TS2300 citation is not needed).
- Population proven by `compilePopulation({in:["@tests"],named:[...]})`: tests/legacy is excluded. Live census: 22 files, 0 findings.
- Divergence: a function-expression method is its own rewrite scope (the gate grouped it under the outer scope).
- Waivers/grants: none (HARD).

## commented-code (HARD, `orb/commented-code`, all `.ts/.tsx` minus gates/** and tests/legacy/**) - done
- parity: 1 mustFlag / 5 mustPass ported, 0 lost (self-scan fence = scope assertions).
- Live census: 7343 files, 0 findings. Same regex, Line comments only, so template data and block comments stay out.
- Waivers/grants: none (HARD).

## assumes-single-replica (ordinary, `orb/assumes-single-replica`, @server + @inference minus persistence) - done
- parity: 3 mustFlag / 9 mustPass ported, 0 lost (waiver row now an eslint-disable test).
- Live census: 2012 files; 4 sites in 3 files the gate would also have flagged (WeakMaps keyed by object identity:
  `domain/credentials/substrate/execution-witness.ts`, `infra/network/ingress.ts`, `primitives/role-data/registry.ts`).
  Fixed with the rule's own file-level `ASSUMES(single-replica)` comment, no disable and no grant. The three states are keyed by
  object identity and never leave the process, so the comment says there is no DB seam rather than naming one; flagged for the owner.
- A same-file `export default class` is resolved like the gate's `getClass` (the class map unwraps ExportDefaultDeclaration);
  one ported row proves it.
- Divergences: the annotation is read from comments only (the gate matched any text); array mutation is resolved through
  scope references, so a shadowing local `ring.push` no longer counts.
- The two shared ordinary-waiver controls in simple-visitors-1584.suite.test.ts are re-driven on `no-vanity-alias`.

## Scaffolding removed
Gates (4), tests/tooling/verify/gates/ct-story-single-import.test.ts, simple-file-hooks.suite.test.ts, the four `_liveness` arms,
the evaluate cases in callback-provenance-family.suite.test.ts, two spelling-twin ledger rows. Citations repointed to `orb/<id>`.
No reviewed grant or waiver-budget row existed for any of the four.

## Owed to primary
`pnpm lint:eslint-scoped`, `check:ledgers-fresh` / active-gates catalog regeneration (rows for the four ids),
`gate-spelling-twins.int.test.ts`, the real-corpus liveness suites, `check:policy-conformance`, eslint-grant-liveness.
