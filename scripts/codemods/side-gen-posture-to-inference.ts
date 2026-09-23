// One-shot codemod: the side-gen sampling ladder moves from `@orb/kit/side-gen-posture` into `@orb/inference`.
// Step `rename` frees the name first: inference already exported a backend-request `SideGenSampling`, so that
// one becomes `TaskSampling`. Step `repoint` then points every importer of the old kit path at the inference
// front door. The new inference files and the kit deletion are hand edits between the two steps.
//
// Preview:  NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/side-gen-posture-to-inference.ts <rename|repoint>
// Apply:    NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/side-gen-posture-to-inference.ts <rename|repoint> --apply

import process from "node:process";
import type { CodemodContext } from "@orb/tooling/codemod";
import { renameExportedSymbol, repointImports, runCodemod } from "@orb/tooling/codemod";

const [step, ...runArgs] = process.argv.slice(2);

await runCodemod(
  `side-gen-posture-to-inference:${String(step)}`,
  (ctx: CodemodContext) => {
    if (step === "rename") {
      ctx.plan(renameExportedSymbol(ctx, "packages/inference/src/contract/roles.ts", { oldName: "SideGenSampling", newName: "TaskSampling" }));
      return;
    }
    if (step === "repoint") {
      ctx.plan(repointImports(ctx, "@orb/kit/side-gen-posture", "@orb/inference"));
      return;
    }
    throw new Error("pass a step: rename | repoint");
  },
  { argv: runArgs },
);
