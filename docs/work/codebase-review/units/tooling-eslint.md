# Unit: tooling-eslint

Band L. Path: tooling/src/eslint/ (18,159 lines). Booted early, owner-requested, right after
root-lint-configs: read the whole of eslint.config.ts as the mounting side, `index.ts` (the
plugin factory) in full, the DOM-lookup consumer's sentinel, and `closed-vocabulary.ts` in full.
The rule-body corpus (~30 rule modules + the css/, ui-classes/, port-ownership/ sublayers) is
NOT yet read body-for-body — coverage state is recorded here so a cold resume knows exactly
where the line is.

## Sweeps

- Mounted-vs-registered diff (both directions, scripted): 156 `orb/...` ids mounted in
  eslint.config.ts, 78 literal registry keys + policy-table ids; zero mounted-but-unfound, zero
  registered-but-unmounted. Typo'd rule ids cannot hide in unmatched blocks either — the diff is
  against the id sources, not against eslint's runtime errors.
- DOM_LOOKUP_HOMES ledger (61 entries, one per whitelisted querySelector call site with
  file/function/receiver/selector/reason): scripted existence check — 0 dead files, 0 dead
  functions; the one `<module>` flag is the sentinel `ui-dom.ts:144` mints for module-scope
  lookups, not a rename.
- Rule→test pairing by FILE name says 32 modules untested; by RULE-ID grep that collapses to
  exactly one gap (below). The file-name heuristic is the trap; the id grep is the receipt.

## Findings

- \[P3] tooling/src/eslint/closed-vocabulary.ts — the only rule of the 156 mounted that has no
  refutation test: `rg -i 'closed-vocabulary'` over tests/ → only subject-side uses in
  tests/inference/conformance/\*.suite.int.test.ts (second method), nothing exercising the rule.
  It is type-aware (checker-driven union-widening check on kind/status/role projections) and
  mounted across AUTHORED_SRC; every sibling rule has planted-positive fixtures. A checker
  heuristic can silently over- or under-report exactly like the esquery selectors do, and the
  repo's own standard for those is a fixture per claim. Direction: one fixture test with a
  widening projection (refuses) and a derived one (passes).

- \[P2] tooling/src/eslint/ (program-level, from the gate-graveyard dig) — the old verify runtime
  made proof a *contract*: `defineGate` descriptors required the proof arrays (mustFlag/mustPass,
  optional mustRefuse), reviewed-grant policies owed an authored grant witness with
  wrong-subject/wrong-operation controls, ordinary policies owed a production-dispatched
  waiver-identity test, and family evidence closed the six obligations; meta-gates
  (`policy-proof-expectations`, `policy-soundness`, refusal-row sweeps) refused a policy with
  missing, empty, or derived-from-the-finding proof rows. Work item 1041 replaced *detection*
  with native enforcement — correct where types and native tools carry the claim — but `821e8f8dff`
  retired the proof-obligation machinery with it, and for the ~156 rule ids that stayed custom the
  successor is convention: ~60 `tests/tooling/eslint-*.test.ts` files plant positive and near-miss
  sources against the real resolved config (quality verified: eslint-assumes-single-replica.test.ts),
  but nothing refuses a new orb rule with zero tests. Exhibits: `closed-vocabulary` (row above) and
  the dead "Pinned by tests/tooling/verify/lib/ledger-banned-shapes.int.test.ts" message
  (units/root-lint-configs.md). Work item 1041 is owner-parked ("resume only with explicit owner
  authorization"), so this is the parked program's open tail, not a regression against the board.
  Direction, in plan 6's own spirit: one repo-integrity test deriving the mounted `orb/` id set
  from the config and the registry rule map, asserting every id appears as a planted-positive rule
  name in at least one tests/tooling file — a machine-checked proof obligation, ~50 lines.

(in-progress) Read so far: eslint.config.ts complete, index.ts complete, registry diff, DOM
ledger diff, closed-vocabulary in full. The mounting layer is in its honest state: exemptions
are `homes()` with a reason or a law §-cite, every `off` I read is scoped and explained, and
the registry takes all its vocabulary by injection — nothing in the plugin reads global state
it could rot on. Remaining: the rule bodies (syntax.ts mechanism, ui-classes/ census layer,
port-ownership/ type-flow layer, principal/security policy tables) and their fixture tests.
