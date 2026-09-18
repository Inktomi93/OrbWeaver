// The per-verb `--help` text table, extracted from cli.ts (tooling-size, #1584 residue).
//
// A mapped-type `Record<VerifyVerb, …>` rather than a switch or a partial map: a new `VERIFY_VERBS`
// member fails tsc until it has a help line, so the front door cannot grow a verb that OOMs on `--help`
// (and the pin in tests/tooling/verify/cli.int.test.ts reads the same tuple, so it exercises it too).
// The two verbs that own richer text supply it themselves (`show`, `scoped`) — one home each.
import type { VerifyVerb } from "./index.ts";
import {
  BASELINE_HELP,
  CONFIG_SNAPSHOT_HELP,
  LEDGER_CLAIMS_HELP,
  NEW_GATE_USAGE,
  SCOPED_TEST_USAGE,
  SCOPED_USAGE,
  SHOW_HELP,
  STRUCTURE_DELTA_USAGE,
  STRUCTURE_USAGE,
  TYPECHECK_HELP,
  TYPECHECK_PLAN_HELP,
} from "./index.ts";

export const VERB_HELP: Readonly<Record<VerifyVerb, string>> = {
  run: "usage: node tooling/src/verify/cli.ts run [--static|--push|--full|--changed] [--scope <glob>|--package <name>|--file <paths…>] [--tier <name>] [--strict-scope] [--list] [--json] [--verbose]",
  structure: STRUCTURE_USAGE,
  "structure-delta": STRUCTURE_DELTA_USAGE,
  show: SHOW_HELP,
  scoped: SCOPED_USAGE,
  "scoped-test": SCOPED_TEST_USAGE,
  "new-gate": NEW_GATE_USAGE,
  "gate-contract": "usage: node tooling/src/verify/cli.ts gate-contract\n  Reports gate modules that bypass the shared ts-morph runtime contract.",
  "policy-conformance":
    "usage: node tooling/src/verify/cli.ts policy-conformance\n  Runs every final defineGate policy's own mustFlag/mustPass rows through the production dispatcher (#1941); a failed proof is exit 2.",
  baseline: BASELINE_HELP,
  "tests-membership":
    "usage: node tooling/src/verify/cli.ts tests-membership [--json]\n  Reports intended and actual compiler ownership for every authored TypeScript file.",
  "tests-execution-membership":
    "usage: node tooling/src/verify/cli.ts tests-execution-membership\n  Reconciles which test files a vitest project actually RUNS — reports the unrun.",
  "db-baseline": "usage: node tooling/src/verify/cli.ts db-baseline\n  Compares the drizzle schema against the committed 0000_baseline.sql.",
  "asset-refs": "usage: node tooling/src/verify/cli.ts asset-refs\n  Reconciles every live FK→assets.id column against the asset-ref classification registry.",
  "orphan-ratchet": "usage: node tooling/src/verify/cli.ts orphan-ratchet [--update]\n  The orphan-export ratchet; --update rewrites its committed baseline.",
  "boot-chunk": "usage: node tooling/src/verify/cli.ts boot-chunk\n  Measures the client boot chunk against its committed ceiling.",
  "ledgers-fresh":
    "usage: node tooling/src/verify/cli.ts ledgers-fresh\n  Reds when a committed single-writer ledger (the caught-failure census and its siblings) differs from a fresh derivation. Writes nothing; names the differing rows and the regen command.",
  "ledger-claims": LEDGER_CLAIMS_HELP,
  "board-citations":
    "usage: node tooling/src/verify/cli.ts board-citations\n  Reconciles every tree→board citation against the board: a warning policy's workItem must be OPEN, and every ledger/roster #N must resolve to a real row. Ledger state disagreements are an ADVISORY census, never a verdict. Needs `gh` auth; a board it cannot read is exit 2, never a clean zero.",
  debt: "usage: node tooling/src/verify/cli.ts debt [--gate <substr>] [--age]\n  A LENS over the ratchet ledgers — reports parked rows, oldest first with --age.",
  "ratchet-gate": "usage: node tooling/src/verify/cli.ts ratchet-gate\n  The vitest-tier train-gate aggregate over the ratchets (#667).",
  "config-snapshot": CONFIG_SNAPSHOT_HELP,
  "biome-rule-liveness":
    "usage: node tooling/src/verify/cli.ts biome-rule-liveness\n  Reds when a biome.json rule-off grant suppresses NOTHING — it strips the rule-off grants from a copy of the config, runs biome over the granted files, and names the grants that fired nowhere. Refuses (exit 2) on any report it cannot trust; a bare zero is never a verdict.",
  "typecheck-plan": TYPECHECK_PLAN_HELP,
  typecheck: TYPECHECK_HELP,
  eslint:
    "usage: node tooling/src/verify/cli.ts eslint\n  Runs whole-repository ESLint in sequential native compiler-owner processes. It takes NO paths: a SCOPED run is `pnpm exec eslint <files>`, which carries the same workspace heap floor.",
};
