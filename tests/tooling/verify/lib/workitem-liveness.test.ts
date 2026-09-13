// The PIN for the warning-debt `workItem` DERIVATION (#2070). The judgement that consumes it — the three
// citation classes, the controls and the exit contract — is pinned beside `lib/board-citations.ts`.
//
// WHAT THIS FILE DEFENDS: the population is DERIVED FROM A REAL CORPUS LOAD, never a roster. The founding
// defect GREW while a hand-maintained list would have looked complete — #2070's body knows only about
// `over-art-plate-arm`, and a SECOND carrier (`policy-refusal-coverage`, `workItem: 2184`) had gone closed
// unnoticed by the time it was adjudicated a day later. So the arm below plants gate modules and drives
// the production loader over them; a warning policy is picked up because the loader saw it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { loadMixedGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { CLOSED_CONTROL_ISSUE, warningWorkItems } from "../../../../tooling/src/verify/lib/workitem-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** A descriptor carrying only the fields the derivation reads; the corpus arm above uses real modules. */
function policy(id: string, workItem?: number): GatePolicy {
  const severity = workItem === undefined ? { severity: "error" as const } : { severity: "warning" as const, workItem };
  return { id, ...severity } as GatePolicy;
}

/** The planted fixture's `workItem`, well outside any real row so a stale reader cannot answer it by luck. */
const PLANTED_WORK_ITEM = 424_242;

interface PlantedModule {
  readonly root: string;
  readonly repoRoot: string;
  readonly name: string;
  readonly id: string;
  /** The authority/severity/workItem lines under test — the only part that varies between fixtures. */
  readonly tier: string;
}

function writeModule({ root, repoRoot, name, id, tier }: PlantedModule): void {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const path = join(root, "tooling/src/verify/gates", name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `import { defineGate } from ${JSON.stringify(contract)};\nexport const gate = defineGate({\n` +
      `  id: ${JSON.stringify(id)},\n  family: ${JSON.stringify(id)},\n  ${tier}\n` +
      `  population: "@tooling",\n  analysis: "syntax",\n  execution: "selected-files",\n  facts: [],\n  resources: [],\n` +
      `  message: "fixture policy",\n  create: () => ({ evaluate: () => undefined }),\n` +
      `  mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\\n" }, why: "founding defect" }],\n` +
      `  mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\\n" }, why: "nearest legal shape" }],\n` +
      "} as never);\n",
  );
}

test("the warning population is DERIVED from a real corpus load — an error policy contributes nothing", async ({ repoRoot, scratch }) => {
  writeModule({
    root: scratch,
    repoRoot,
    name: "planted-warning.ts",
    id: "planted-warning",
    tier: `authority: "ordinary",\n  severity: "warning",\n  workItem: ${String(PLANTED_WORK_ITEM)},`,
  });
  writeModule({ root: scratch, repoRoot, name: "planted-error.ts", id: "planted-error", tier: 'authority: "hard",\n  severity: "error",' });
  const corpus = await loadMixedGateCorpus(scratch);
  expect(corpus.final).toHaveLength(2);

  // `workItem` exists only on the `warning` arm of the descriptor union, so this is total by construction.
  expect(warningWorkItems(corpus.final)).toEqual([{ policy: "planted-warning", workItem: PLANTED_WORK_ITEM }]);
});

test("warningWorkItems keeps corpus order and reads the number off the warning arm only", () => {
  expect(warningWorkItems([policy("z", 3), policy("m"), policy("a", 1)])).toEqual([
    { policy: "z", workItem: 3 },
    { policy: "a", workItem: 1 },
  ]);
});

test("the closed control is a real, permanently-closed row rather than a magic number", () => {
  // Issue #1 — the repository's first row. The arm exists so a lane that "tidies" the constant to 0 or to a
  // live row has to answer for it here; the RUNTIME half (that the board still reports it CLOSED) is the
  // control inside every real invocation, which is where a reopened row is caught.
  expect(CLOSED_CONTROL_ISSUE).toBe(1);
});
