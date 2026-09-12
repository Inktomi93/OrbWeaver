// The `baseline` verb — the SINGLE-WRITER door for every committed baseline (GATE-AUTHORING §4.8).
// Split out of cli.ts at #1117: the kind table plus the strict tail is a command family, and cli.ts is
// capped at 200 lines because argv parse + dispatch is all it may ever hold (Core-Tooling-Law §2.5/§4.3).
//
// `baseline <kind>` WRITES; `baseline <kind> --check` derives and DIFFS, writing nothing (#817). Only the
// two line-number/fileset-coupled ledgers carry a `--check` arm — the rest have no reader that could go
// stale between regens, and a `--check` for a kind that has none is misuse, never a silent write.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import { generateBaseuiSurface } from "./gen/baseui-surface.ts";
import { generateCaughtFailurePopulation } from "./gen/caught-failure-population.ts";
import { generateDensityBaseline } from "./gen/density.ts";
import { generateDuplicateActionDoorsBaseline } from "./gen/duplicate-action-doors.ts";
import { generateProseBaseline } from "./gen/prose.ts";
import { generateReadFirstCosts } from "./gen/read-first-costs.ts";
import { generateSnapFlagsIndex } from "./gen/snap-flags-index.ts";
import { generateTestBaselineManifest } from "./gen/test-baseline-manifest.ts";
import { generateTypeConfigs } from "./gen/type-configs.ts";
import { LEDGER_CHECKS } from "./ledgers-fresh.ts";

refuseDirectInvocation(import.meta.url, "pnpm exec node tooling/src/verify/cli.ts baseline <kind> [--check]");

/** The committed baselines this tool is the SINGLE writer of. A `Record` rather than a switch: a new
 *  baseline generator is a row, and tsc requires the row to exist before the kind can be spelled. */
const BASELINES: Readonly<Record<string, (root: string) => number>> = {
  "baseui-surface": generateBaseuiSurface,
  // NOT a ratchet: a derived REVIEW RECORD no gate reads (#751). It rides the same single-writer door so
  // the census cannot be hand-edited into agreement with itself.
  "caught-failure-population": generateCaughtFailurePopulation,
  density: generateDensityBaseline,
  "duplicate-action-doors": generateDuplicateActionDoorsBaseline,
  prose: generateProseBaseline,
  // A generated COLUMN inside a hand-authored document, not a generated file: the read-first table's SIZE
  // cells are derived and its Read/Stop-rule prose is authored, joined by the row id. #2017 — every one of
  // those eight numbers was stale at once, the work queue by 7x.
  "read-first-costs": generateReadFirstCosts,
  "snap-flags-index": generateSnapFlagsIndex,
  "test-baseline-manifest": generateTestBaselineManifest,
  "type-configs": generateTypeConfigs,
};

/** This verb's usage text — ONE home, read by the refusals here and by the front door's pre-dispatch
 *  `--help` answer (cli.ts VERB_HELP, #809). */
export const BASELINE_HELP =
  `usage: node tooling/src/verify/cli.ts baseline <${Object.keys(BASELINES).sort().join("|")}> [--check]\n` +
  "  Regenerates a COMMITTED baseline — the single-writer door (GATE-AUTHORING §4.8). Never run on a shared tree mid-lane.\n" +
  `  --check derives and DIFFS instead of writing (exit 1 on drift); available for ${Object.keys(LEDGER_CHECKS).sort().join(", ")}.`;

export function runBaseline(root: string, rest: readonly string[]): number {
  const kind = rest[0];
  const generate = kind === undefined ? undefined : BASELINES[kind];
  if (kind === undefined || generate === undefined) {
    throw new UsageError(`baseline: unknown kind ${kind ?? "(none)"} — one of ${Object.keys(BASELINES).sort().join(", ")}`);
  }
  // `<kind>` and an optional `--check` are the WHOLE tail, refused BEFORE the single-writer door opens
  // (#1117): a mistyped `--chekc` used to be dropped on the floor, and this verb's silent-ignore WRITES
  // the committed ledger the operator asked to merely diff.
  const stray = rest.slice(1).find((token) => token !== "--check");
  if (stray !== undefined) {
    throw new UsageError(`baseline ${kind}: unexpected argument ${JSON.stringify(stray)} — usage: baseline <kind> [--check]`);
  }
  if (!rest.includes("--check")) {
    return generate(root);
  }
  const verify = LEDGER_CHECKS[kind];
  if (verify === undefined) {
    throw new UsageError(
      `baseline --check: ${kind} has no freshness arm — one of ${Object.keys(LEDGER_CHECKS).sort().join(", ")} (or drop --check to regenerate)`,
    );
  }
  return verify(root);
}
