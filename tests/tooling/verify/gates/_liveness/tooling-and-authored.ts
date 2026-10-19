// Real-corpus liveness arms (#2149) for the policies whose declared population is `@tooling` or `@authored`
// (0042's third chunk). DATA, collected by the one runner (`./runner.ts`),
// which loads each isolated structure corpus once and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE: a new file inside a real tool
// or package for an occurrence policy, every real subject taken away for a blindness tripwire, and a planted
// tail on a real doc or source file (through the ResourceHost's own overlay) for a policy that reads its
// subject as a resource. No add path lands in `tooling/src/verify/gates/`, where it would join the gate
// roster every roster-reading policy in the shared pass sees.

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as noHardcodedModelProse } from "../../../../../tooling/src/verify/gates/no-hardcoded-model-prose.ts";
import { gate as toolingArgvFrontDoor } from "../../../../../tooling/src/verify/gates/tooling-argv-front-door.ts";
import { gate as toolingArtifactPathHome } from "../../../../../tooling/src/verify/gates/tooling-artifact-path-home.ts";
import { gate as toolingArtifactRunSlot } from "../../../../../tooling/src/verify/gates/tooling-artifact-run-slot.ts";
import { gate as toolingBrowserDoor } from "../../../../../tooling/src/verify/gates/tooling-browser-door.ts";
import { gate as toolingChildProcessDoor } from "../../../../../tooling/src/verify/gates/tooling-child-process-door.ts";
import { gate as toolingProcessExitHome } from "../../../../../tooling/src/verify/gates/tooling-process-exit-home.ts";
import { gate as toolingProjectHome } from "../../../../../tooling/src/verify/gates/tooling-project-home.ts";

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

export const TOOLING_AND_AUTHORED_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: noHardcodedModelProse,
    // The dead-catalog arm reads a fixed catalog path, so the real catalog is swapped for one dead const.
    overlays: [
      {
        kind: "neutralise",
        path: "packages/contracts/src/discovery/prose.ts",
        source: 'export const LIVENESS_DEAD_PROSE =\n  "This catalog line is referenced by nothing and has enough words to trip the twelve word floor.";\n',
      },
    ],
    messageIncludes: "DEAD catalog prose",
  },
  {
    policy: toolingArgvFrontDoor,
    overlays: [add("tooling/src/codemod/lib/liveness-argv.ts", 'import process from "node:process";\nexport const limit = process.argv.slice(2).length;\n')],
    messageIncludes: "a second argv reader",
  },
  {
    policy: toolingArtifactPathHome,
    overlays: [add("tooling/src/snap/ops/liveness-out.ts", 'import { join } from "node:path";\nexport const d = join("/root", "reports", "snaps");\n')],
    messageIncludes: "a hand-rolled reports/<kind> path",
  },
  {
    policy: toolingArtifactRunSlot,
    // A new tool whose ops file artifacts through the real door while its cli.ts opens no run slot.
    overlays: [
      add("tooling/src/livenessunslotted/cli.ts", 'import { shoot } from "./ops/shoot.ts";\nexport const run = shoot;\n'),
      add(
        "tooling/src/livenessunslotted/ops/shoot.ts",
        'import { artifactFile } from "../../floor/artifacts/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
      ),
    ],
    messageIncludes: "must open its artifact run slot",
  },
  {
    policy: toolingBrowserDoor,
    overlays: [
      add("tooling/src/snap/ops/liveness-capture.ts", 'import { chromium } from "@playwright/test";\nexport const b = chromium.launch({ headless: true });\n'),
    ],
    messageIncludes: "operation: browser-launch",
  },
  {
    policy: toolingChildProcessDoor,
    overlays: [add("tooling/src/seed/ops/liveness-raw.ts", 'import { spawn } from "node:child_process";\nexport const s = spawn;\n')],
    messageIncludes: "operation: child-process-import",
  },
  {
    policy: toolingProcessExitHome,
    overlays: [add("tooling/src/ast/ops/liveness-bail.ts", 'import process from "node:process";\nexport function bail(): never {\n  process.exit(2);\n}\n')],
    messageIncludes: "a bare process.exit",
  },
  {
    policy: toolingProjectHome,
    overlays: [add("tooling/src/ast/ops/liveness-load.ts", 'import { Project } from "ts-morph";\nexport const p = new Project({});\n')],
    messageIncludes: "a second ts-morph loader",
  },
];
