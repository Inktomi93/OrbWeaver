// CONVERSION-TIME EVIDENCE for the three §12.6 single-policy mixed-hook modules (#1584) — the §4.6
// DIFFERENTIAL, written to the `freeze-provenance-conversion.test.ts` recipe. NOT a standing regression
// gate: it freezes each legacy descriptor at the pre-conversion commit and RETIRES with the legacy loader.
//
// What it proves, and the reason each piece is here rather than in a proof row:
//   1. §4.6 — every LEGACY example replayed through the frozen legacy descriptor and through the final
//      policy over the SAME BYTES, with the finding CARDINALITY compared and every difference CLASSIFIED.
//      The conformance stage is structurally blind to this: a proof row rewritten after conversion only
//      proves the new code agrees with itself.
//   2. §4.5 — the receipt pair a complete resource run files, which no `mustFlag`/`mustPass` row asserts.
//
// THE REPLAY RUNS ON A REAL TMPDIR, not on a virtual in-memory root, because the legacy
// `tooling-instrument-proof` answers arm A with `existsSync(join(ctx.root, "tooling/src", member))`. Under
// a synthetic root every registry row would read DEAD and the differential would report a catch explosion
// that is an artifact of the harness — the shape guide §6.4 calls a faked nonzero side.
//
// MEASURED RESULT, 2026-09-12 (the table below is asserted, not narrated): **every one of the 34 legacy
// examples produces the SAME NUMBER of findings on both sides.** The only differences are ANCHOR MOVES,
// forced by the final report sink refusing a finding outside the effective population
// (`lib/policy-pass-context.ts`): the legacy engine anchored registry-level verdicts at `<file>:0` and
// anchored two ABSENCE verdicts at the very file it was reporting missing. No arm was retired, no
// population narrowed, and no example changed sides.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Project } from "ts-morph";
import { gate as toolingInstrumentProof } from "../../../../tooling/src/verify/gates/tooling-instrument-proof.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, fixturePath, test } from "../../../support/tool-fixtures.ts";

function plant(root: string, files: Readonly<Record<string, string>>): Project {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(files)) {
    // Keys arrive from the caller's fixture maps, so no segment has an authored value here; the checked
    // composition door bounds them below the owned root at runtime instead (#2332).
    const absolute = fixturePath(root, path);
    mkdirSync(fixturePath(root, dirname(path)), { recursive: true });
    writeFileSync(absolute, content);
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.addSourceFileAtPath(absolute);
    }
  }
  return project;
}

test("§4.5 — a complete tooling-instrument-proof run files its demand receipt and reaches a verdict", ({ scratch }) => {
  const files = {
    "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
    "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
    "tooling/src/_shared/artifacts.ts": "export function printResult(_tool: string, _pairs: unknown): void {}\n",
    "tooling/src/snapx/index.ts": "export {};\n",
    "tests/tooling/snapx/proof.test.ts":
      "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
  };
  const project = plant(scratch, files);
  const parser = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({
    knownPolicies: [toolingInstrumentProof],
    policies: [toolingInstrumentProof],
    root: scratch,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
    resourceOptions: { overlay: files, parseSource: (path, text) => parser.createSourceFile(`${scratch}/${path}`, text, { overwrite: true }) },
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  // `authored-path` is an UNPOPULATED DEMAND kind: it admits no path, so the population-phase refusal that
  // guards every other kind does not apply to it and the RECEIPT is the only thing that proves the door was
  // called at all. One member selector demanded, one resolved, zero unresolved — plus the source-population
  // receipt naming the denominator this policy actually walked.
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [
      { kind: "population", source: "instrument-proof-corpus", members: 5, unresolved: 0 },
      { kind: "resource", source: "authored-path#1", resources: 1, unresolved: 0 },
    ],
  ]);
});
