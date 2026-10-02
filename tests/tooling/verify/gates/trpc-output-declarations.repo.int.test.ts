// Native installed tRPC types, mounted population, and virtual-only omissions on actual service routes.

import process from "node:process";
import { gate } from "../../../../tooling/src/verify/gates/trpc-output-declarations.ts";
import type { RealCorpusLivenessArm } from "../../../support/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const arm = {
  policy: gate,
  overlays: [
    {
      kind: "edit",
      path: "packages/server/src/transport/trpc/routers/refinery.ts",
      replace: ["iterate: authedProcedure\n    .output(iterateResultSchema)", "iterate: authedProcedure"],
    },
    {
      kind: "edit",
      path: "packages/server/src/transport/trpc/routers/refinery.ts",
      replace: ["applyFields: authedProcedure\n    .output(applyFieldsResultSchema)", "applyFields: authedProcedure"],
    },
    {
      kind: "edit",
      path: "packages/server/src/transport/trpc/routers/refinery.ts",
      replace: ["applyAsCopy: authedProcedure\n    .output(applyAsCopyResultSchema)", "applyAsCopy: authedProcedure"],
    },
    {
      kind: "edit",
      path: "packages/server/src/transport/trpc/routers/chat.ts",
      replace: ["listMessages: authedProcedure\n    .output(messagesPageSchema)", "listMessages: authedProcedure"],
    },
    {
      kind: "edit",
      path: "packages/server/src/transport/trpc/routers/workloads.ts",
      replace: ["get: authedProcedure\n    .output(workloadRowAnyKindSchema)", "get: authedProcedure"],
    },
  ],
  messageIncludes: "Mounted: refinery.iterate",
} satisfies RealCorpusLivenessArm;

test("native AppRouter output coverage is clean and virtual omission controls all bite", () => {
  const runner = openRealCorpusLiveness(process.cwd(), [arm]);
  expect(runner.assertBaseline()).toEqual([gate.id]);
  const verdict = runner.verdict(arm);
  const messages = assertArmVerdict(arm, verdict).join("\n");
  for (const path of ["refinery.iterate", "refinery.applyFields", "refinery.applyAsCopy", "chat.listMessages", "workloads.get"]) {
    expect(messages).toContain(`Mounted: ${path}`);
  }
}, 60_000);
