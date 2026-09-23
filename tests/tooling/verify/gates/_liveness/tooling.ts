// Real-corpus liveness arms (#2149) for policies whose subject is the tooling tree, the gate corpus
// included. DATA, collected by the one runner (`../real-corpus-liveness-family.suite.repo.int.test.ts`),
// which loads the structure run's own corpus once and runs every arm against it (docs/work/0043).
import { gate as warningWorkitemLiveness } from "../../../../../tooling/src/verify/gates/warning-workitem-liveness.ts";
import type { RealCorpusLivenessArm } from "../../../../support/real-corpus-liveness.ts";

/** A work item id far above any the tree will mint, so the control cannot be answered by a real item. */
const ABSENT_ITEM = 99_999;

export const TOOLING_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: warningWorkitemLiveness,
    // A warning policy whose owner names no docs/work item: the live gate corpus plus one probe module must
    // report exactly that probe, at its `workItem` property.
    overlays: [
      {
        kind: "add",
        path: "tooling/src/verify/gates/workitem-liveness-probe.ts",
        source:
          'import { defineGate } from "../contract/policy.ts";\n' +
          `export const gate = defineGate({ id: "workitem-liveness-probe", severity: "warning", workItem: ${String(ABSENT_ITEM)} });\n`,
      },
    ],
    messageIncludes: `No item ${String(ABSENT_ITEM)} exists`,
  },
];
