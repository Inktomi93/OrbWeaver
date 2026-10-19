// Real-corpus liveness arms (#2149) for policies judging the server-side packages. DATA, collected by the
// one runner (`./runner.ts`), which loads the isolated structure corpora and runs every arm against it — so an arm names no corpus of its own (docs/work/0043).

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as serdeCoreHealth } from "../../../../../tooling/src/verify/gates/serde-core-seal-health.ts";

/** A neutralise overlay that simply removes the watched subject from a file. */
function blank(path: string): RealCorpusOverlay {
  return { kind: "neutralise", path, source: "export const neutralised = 1;\n" };
}

export const SERVER_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: serdeCoreHealth,
    // A SANCTIONED DOMAIN, not a file: the `import` domain carries the engine import in three places, so
    // blanking one leaves the sanction alive and the tripwire correctly silent. All three or nothing.
    overlays: [
      blank("packages/server/src/domain/import/verbs/import-character.ts"),
      blank("packages/server/src/domain/import/verbs/restore-character-book.ts"),
      blank("packages/server/src/domain/import/substrate/card.ts"),
    ],
    messageIncludes: '"import"',
  },
];
