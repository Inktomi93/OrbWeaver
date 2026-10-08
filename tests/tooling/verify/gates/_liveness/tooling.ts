// Real-corpus liveness arms (#2149) for policies whose subject is the tooling tree, the gate corpus
// included. DATA, collected by the one runner (`./runner.ts`),
// which loads each isolated structure corpus once and runs every arm against it (docs/work/0043).
import { gate as testExecutableMode } from "../../../../../tooling/src/verify/gates/test-executable-mode.ts";
import { gate as toolingOsNeutral } from "../../../../../tooling/src/verify/gates/tooling-os-neutral.ts";
import { gate as warningWorkitemLiveness } from "../../../../../tooling/src/verify/gates/warning-workitem-liveness.ts";
import type { RealCorpusLivenessArm } from "../../../../support/real-corpus-liveness.ts";

/** A work item id far above any the tree will mint, so the control cannot be answered by a real item. */
const ABSENT_ITEM = 99_999;

export const TOOLING_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: toolingOsNeutral,
    // A hardcoded `/tmp` beside the live tooling tree: the whole population plus one probe module must
    // report exactly that probe, at its literal.
    overlays: [{ kind: "add", path: "tooling/src/_shared/os-neutral-liveness-probe.ts", source: 'export const scratch = "/tmp/orb-liveness";\n' }],
    messageIncludes: "a hardcoded `/tmp` path",
  },
  {
    policy: testExecutableMode,
    // The real candidate index says this tracked test is ordinary. Preserve that identity and overlay only
    // mode 100755; source bytes or a shebang would not exercise the tracked-files reader's mode evidence.
    overlays: [
      {
        kind: "tracked-mode",
        path: "tests/tooling/verify/gates/tooling-os-neutral.test.ts",
        executable: true,
      },
    ],
    messageIncludes: "an executable Git mode on a test file",
  },
  {
    policy: warningWorkitemLiveness,
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
