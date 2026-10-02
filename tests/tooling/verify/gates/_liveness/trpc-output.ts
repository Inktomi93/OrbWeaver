import { gate } from "../../../../../tooling/src/verify/gates/trpc-output-declarations.ts";
import type { RealCorpusLivenessArm } from "../../../../support/real-corpus-liveness.ts";

export const TRPC_OUTPUT_ARMS: readonly RealCorpusLivenessArm[] = [
  {
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
  },
];
