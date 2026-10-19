// Real-corpus liveness arms (#2149) for policies judging the server-side packages. DATA, collected by the
// one runner (`./runner.ts`), which loads the isolated structure corpora and runs every arm against it — so an arm names no corpus of its own (docs/work/0043).

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as contractDerives } from "../../../../../tooling/src/verify/gates/contract-derives-not-respells.ts";
import { gate as serdeCoreHealth } from "../../../../../tooling/src/verify/gates/serde-core-seal-health.ts";

/** A neutralise overlay that simply removes the watched subject from a file. */
function blank(path: string): RealCorpusOverlay {
  return { kind: "neutralise", path, source: "export const neutralised = 1;\n" };
}

export const SERVER_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: contractDerives,
    // WAS `contract-derives-not-respells-health`, a NEUTRALISE arm that blanked the file one ALLOWLIST row
    // named. That policy retired with the table (#2176 Phase F): the two rows are central reviewed grants and
    // a dead row is now `stale-reviewed-grant`, which is an authority ALARM and not a policy report, so no
    // liveness arm can express it — its successor is the grant-reconciliation pin in
    // `contract-shape-wave-1.suite.test.ts`. What is pinned HERE is the surviving occurrence policy, and an ADD
    // is the only shape that can speak for it: a NEW domain `contract/` file hand-spelling a real table's row.
    // `characters` is a live `sqliteTable` export in `packages/db/src/schema/`, so `CharacterRow` matches it
    // and no grant names this path — an UNGRANTED hand-row is an effective finding on the real tree rather
    // than a fixture-only verdict.
    overlays: [
      {
        kind: "add",
        path: "packages/server/src/domain/character/contract/__cb2176b-liveness.ts",
        source: "export interface CharacterRow {\n  readonly id: string;\n}\n",
      },
    ],
    messageIncludes: 'hand-row "CharacterRow"',
  },
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
