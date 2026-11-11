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

## Verdict

(in-progress) Read so far: eslint.config.ts complete, index.ts complete, registry diff, DOM
ledger diff, closed-vocabulary in full. The mounting layer is in its honest state: exemptions
are `homes()` with a reason or a law §-cite, every `off` I read is scoped and explained, and
the registry takes all its vocabulary by injection — nothing in the plugin reads global state
it could rot on. Remaining: the rule bodies (syntax.ts mechanism, ui-classes/ census layer,
port-ownership/ type-flow layer, principal/security policy tables) and their fixture tests.
