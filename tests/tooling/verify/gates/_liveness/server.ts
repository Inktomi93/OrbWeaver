// Real-corpus liveness arms (#2149) for policies judging the server-side packages. DATA, collected by the
// one runner (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own
// corpus once and runs every arm against it — so an arm names no corpus of its own (docs/work/0043).
import { gate as contractDerives } from "../../../../../tooling/src/verify/gates/contract-derives-not-respells.ts";
import { gate as externalIdHealth } from "../../../../../tooling/src/verify/gates/external-id-single-writer-health.ts";
import { gate as injectedOpHealth } from "../../../../../tooling/src/verify/gates/injected-op-caller-param-health.ts";
import { gate as serdeCoreHealth } from "../../../../../tooling/src/verify/gates/serde-core-seal-health.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

/** A neutralise overlay that simply removes the watched subject from a file. */
function blank(path: string): RealCorpusOverlay {
  return { kind: "neutralise", path, source: "export const neutralised = 1;\n" };
}

export const SERVER_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: externalIdHealth,
    // The tripwire watches the U1 admin link capability for its atomic writer call. Remove the call and it
    // must say so — ADDING a file could never make this policy speak.
    overlays: [
      {
        kind: "neutralise",
        path: "packages/server/src/domain/sessions/verbs/link-external-id.ts",
        source: "export async function linkExternalId(): Promise<void> {\n  // the atomic writer call is gone\n}\n",
      },
    ],
    messageIncludes: "no longer calls",
  },
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
    policy: injectedOpHealth,
    // The policy DERIVES entity-id type names from the ids module. Blank it and the derivation returns zero,
    // which is the blindness the tripwire exists for.
    overlays: [blank("packages/kit/src/ids/index.ts")],
    messageIncludes: "derived ZERO entity-id type names",
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
