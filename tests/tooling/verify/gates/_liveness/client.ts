// Real-corpus liveness arms (#2149) for policies judging the frontend packages (`@client`, `@ui`). DATA,
// collected by the one runner (`./runner.ts`), which loads the
// isolated structure corpora and runs every arm against it (docs/work/0043).

import type { RealCorpusLivenessArm } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as doors } from "../../../../../tooling/src/verify/gates/duplicate-action-doors.ts";
import { gate as wireInterface } from "../../../../../tooling/src/verify/gates/no-inline-wire-interface.ts";
import { gate as historyWrites } from "../../../../../tooling/src/verify/gates/no-raw-history-writes.ts";

export const CLIENT_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: wireInterface,
    overlays: [
      { kind: "add", path: "packages/client/src/data/liveness-wire.ts", source: "export interface LivenessImportResult {\n  readonly chatId: string;\n}\n" },
    ],
    messageIncludes: "exported wire-named plain-data interface",
  },
  {
    policy: historyWrites,
    messageIncludes: "browser History mutation directly",
    overlays: [{ kind: "add", path: "packages/client/src/lib/router-history-liveness.ts", source: 'globalThis.history.replaceState(null, "", "/");' }],
  },
  {
    policy: doors,
    // TWO overlays because one door is not a duplication: the pair must be minted whole. Both paths sort
    // BEFORE every real door of their own new procedure, so the aggregated finding anchors on `…-a.tsx` and
    // the arm's `add` scope can see it.
    overlays: [
      {
        kind: "add",
        path: "packages/client/src/features/chat/components/pcdd-live-probe-a.tsx",
        source: "export const A = () => trpc.chat.pcddLiveProbe.mutationOptions();\n",
      },
      {
        kind: "add",
        path: "packages/client/src/features/chat/components/pcdd-live-probe-b.tsx",
        source: "export const B = () => trpc.chat.pcddLiveProbe.mutationOptions();\n",
      },
    ],
    messageIncludes: "Subject: chats::chat.pcddLiveProbe",
  },
];
