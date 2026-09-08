// The front door's VERB VOCABULARY — one importable union, spoken by cli.ts's dispatch, by its per-verb
// `--help` map, and by the pin that proves every verb answers help without doing work (#809).
//
// It lives in contract/ rather than inside cli.ts because cli.ts is an ENTRYPOINT: importing it RUNS the
// tool (`await runTool(...)` at module scope), so a test that wants to enumerate the verbs cannot read
// them from there. A hardcoded second copy in the test would rot the day a verb is added — which is the
// exact failure #809 is: a code path nobody exercised.
export const VERIFY_VERBS = [
  "run",
  "structure",
  "show",
  "scoped",
  "scoped-test",
  "new-gate",
  "gate-contract",
  "baseline",
  "tests-membership",
  "tests-execution-membership",
  "db-baseline",
  "asset-refs",
  "orphan-ratchet",
  "boot-chunk",
  "ledgers-fresh",
  "debt",
  "ratchet-gate",
  "config-snapshot",
  "typecheck-plan",
] as const;

export type VerifyVerb = (typeof VERIFY_VERBS)[number];
