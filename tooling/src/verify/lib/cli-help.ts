// The per-verb `--help` text table, extracted from cli.ts (tooling-size, #1584 residue).
//
// A mapped-type `Record<VerifyVerb, …>` rather than a switch or a partial map: a new `VERIFY_VERBS`
// member fails tsc until it has a help line, so the front door cannot grow a verb that OOMs on `--help`
// (and the pin in tests/tooling/verify/cli.int.test.ts reads the same tuple, so it exercises it too).
// The two verbs that own richer text supply it themselves (`show`, `scoped`) — one home each.
import type { VerifyVerb } from "../contract/verbs.ts";
import { BASELINE_HELP } from "../ops/baseline.ts";
import { CONFIG_SNAPSHOT_HELP } from "../ops/config-snapshot.ts";
import { LEDGER_CLAIMS_HELP } from "../ops/ledger-claims.ts";
import { NEW_GATE_USAGE } from "../ops/new-gate.ts";
import { SCOPED_USAGE } from "../ops/scoped.ts";
import { SCOPED_TEST_USAGE } from "../ops/scoped-test.ts";
import { SHOW_HELP } from "../ops/show.ts";
import { STRUCTURE_DELTA_USAGE } from "../ops/structure-delta.ts";
import { TYPECHECK_HELP } from "../ops/typecheck.ts";
import { TYPECHECK_PLAN_HELP } from "../ops/typecheck-plan.ts";
import { STRUCTURE_USAGE } from "./structure-tail.ts";

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
  "boot-chunk":
    "usage: node tooling/src/verify/cli.ts boot-chunk\n  Builds the client, measures its boot chunk against the committed ceiling, checks that the emitted html links the app stylesheet, and checks that no emitted chunk carries a DEV-only client instrument.",
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
  "knip-negative-liveness":
    "usage: node tooling/src/verify/cli.ts knip-negative-liveness\n  Reds when a LITERAL negative entry/project/ignore pattern in knip.ts names a path that is not a tracked file. Wildcard negations are out of scope. An unreadable index is exit 2.",
  "typecheck-plan": TYPECHECK_PLAN_HELP,
  typecheck: TYPECHECK_HELP,
  "instrument-affected":
    "usage: node tooling/src/verify/cli.ts instrument-affected\n  Runs the family tests of the instruments THIS BRANCH changed (#1967) — reached through the shared test mirror AND through the gate-ID string, because a family test routinely lives under its WAVE's name rather than its gate's. It takes NO paths: the branch diff IS the selection. A changed instrument reaching no spec is VIOLATIONS (1), never a clean zero; an uncomputable branch answer runs the whole instrument battery rather than selecting nothing.",
  eslint:
    "usage: node tooling/src/verify/cli.ts eslint\n  Runs whole-repository ESLint in sequential native compiler-owner processes. It takes NO paths: a SCOPED run is `pnpm exec eslint <files>`, which carries the same workspace heap floor.",
};
