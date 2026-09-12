// REAL-CORPUS LIVENESS for the eight modules #2149 names — the arm that tells "silent because the tree is
// clean" apart from "silent because the policy is dead".
//
// WHY THIS FILE EXISTS AND WHY IT IS NOT EIGHT EDITS TO EIGHT FAMILY TESTS. #2149 was raised as eight
// modules; re-censused from the LATEST published structure slot it is **228 of 246 finals**, and the row's
// partition (20 "carry a planted control", 8 do not) existed only inside a VOIDED run — slot
// `main-2930600-2026-09-12T13-42-50-932Z`, which carried 650 `__g_`/`__dc_` findings because a planting
// suite wrote fixtures into the working tree while the run read it. The clean slot
// `main-3632865-2026-09-12T15-40-44-410Z` carries ZERO, because NO final policy plants, by construction
// (guide §4.8). A conjunct true of all 246 discriminates nothing. Ruled program shape: every final policy
// owes one real-corpus liveness pin, these eight first, the rest by family in chunks.
//
// So the arms are DATA, declared per policy and run through one shared helper, because an enforcer arm is
// coming that must be able to census which policies have a pin. Eight ad-hoc `expect` calls buried in eight
// family tests would be uncensusable.
//
// THE COST CONSTRAINT IS REAL AND SHAPES THE FILE, AND IT IS WHY THIS IS `.repo.int`. Each arm needs a
// ts-morph project over its policy's population; building one PER ARM would be ~228 project builds, so the
// helper groups arms by glob-set and builds each corpus ONCE. Measured here: two corpora (`@server`, and
// `@server`+`@db`) cost ~9s of test time, which blew the fast `tooling` project's 7.2s timeout on the first
// run. A real-corpus arm belongs in the INTEGRATION project beside its siblings
// (`no-blanket-suppression.repo.int.test.ts`, `policy-soundness-family.repo.int.test.ts`,
// `conversion-refusal-liveness.repo.int.test.ts`) — landing one in the unit project makes it a load-shaped
// flake. **That ~4.5s-per-corpus figure is the planning input for chunking the remaining ~220: group by
// POPULATION, not by family name, or the chunk pays for a corpus per module.**
//
// SIX OF THE EIGHT ARE HERE, and the two absentees are absent for a MEASURED reason rather than a skipped
// one. Both are the `analysis: "types"` modules — `persist-partialize-and-total-migrate` and
// `section-factory-contribution-bundle` — and both need a full TYPE GRAPH over `@client`, not the pure-AST
// project the other six share. Measured by WRITING the `persist-partialize` arm and running it: the suite
// went from 24s to **46s and timed out at the integration project's ~40s ceiling**. One `types` corpus
// costs more than all six syntax arms together, and raising the timeout would make this suite the
// load-shaped hazard I removed from it one commit ago.
//
// So the `types` tier owes its own decision before its arms land — its own file with its own budget, one
// shared type-graph corpus across every `types` policy, or `--full`-only. **It is a scheduling question,
// not a mechanism question: the helper already takes `types: true`, the arm was written, and it ran.**
// `section-factory-contribution-bundle` additionally consumes a registry FACT
// (`registryDefinitionFacts.section`), so its arm owes a fact-resolution check the other seven do not.
import { gate as contractDerivesHealth } from "../../../../tooling/src/verify/gates/contract-derives-not-respells-health.ts";
import { gate as ctPollHealth } from "../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint-health.ts";
import { gate as externalIdHealth } from "../../../../tooling/src/verify/gates/external-id-single-writer-health.ts";
import { gate as injectedOpHealth } from "../../../../tooling/src/verify/gates/injected-op-caller-param-health.ts";
import { gate as serdeCoreHealth } from "../../../../tooling/src/verify/gates/serde-core-seal-health.ts";
import { gate as windowedHealth } from "../../../../tooling/src/verify/gates/windowed-infinite-query-health.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../support/real-corpus-liveness.ts";
import { assertRealCorpusLivenessArms } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// THE GLOBS MUST COVER THE POLICY'S WHOLE DECLARED POPULATION, and getting this wrong does not fail
// quietly — it manufactures findings. `contract-derives-not-respells-health` declares `["@server", "@db"]`;
// built over `@server` alone it reported TWO stale-allowlist findings in the BASELINE, because the rows its
// allowlist names live in `@db` and an absent row reads exactly like a deleted one. The helper's clean-
// baseline guard refused the arm rather than letting it "pass", which is the guard earning its place on its
// first real use.
const SERVER = ["packages/server/src/**/*.ts"];
const SERVER_AND_DB = ["packages/server/src/**/*.ts", "packages/db/src/**/*.ts"];
const SERVER_KIT_DB = ["packages/server/src/**/*.ts", "packages/kit/src/**/*.ts", "packages/db/src/**/*.ts"];
const SERVER_AND_KIT = ["packages/server/src/**/*.ts", "packages/kit/src/**/*.ts"];
const CLIENT = ["packages/client/src/**/*.ts", "packages/client/src/**/*.tsx"];
const CT_ANCHOR = ["tests/client/lib/**/*.tsx"];

const BLANK = "export const neutralised = 1;\n";

/** A neutralise overlay that simply removes the watched subject from a file. */
function blank(path: string): RealCorpusOverlay {
  return { kind: "neutralise", path, source: BLANK };
}

/** The declared arms. One per policy, DATA rather than a call, so the coming enforcer can census them. */
const ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: externalIdHealth,
    globs: SERVER,
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
    policy: contractDerivesHealth,
    globs: SERVER_AND_DB,
    // The allowlist names hand-spelled row shapes; blank the module one lives in and the stale-row arm fires.
    overlays: [blank("packages/server/src/domain/discovery/contract/results.ts")],
    messageIncludes: "ThemeRow",
  },
  {
    policy: injectedOpHealth,
    globs: SERVER_KIT_DB,
    // The policy DERIVES entity-id type names from the ids module. Blank it and the derivation returns zero,
    // which is the blindness the tripwire exists for.
    overlays: [blank("packages/kit/src/ids/index.ts")],
    messageIncludes: "derived ZERO entity-id type names",
  },
  {
    policy: serdeCoreHealth,
    globs: SERVER_AND_KIT,
    // A SANCTIONED DOMAIN, not a file: the `import` domain carries the engine import in three places, so
    // blanking one leaves the sanction alive and the tripwire correctly silent. All three or nothing.
    overlays: [
      blank("packages/server/src/domain/import/verbs/import-character.ts"),
      blank("packages/server/src/domain/import/verbs/restore-character-book.ts"),
      blank("packages/server/src/domain/import/substrate/card.ts"),
    ],
    messageIncludes: '"import"',
  },
  {
    policy: windowedHealth,
    globs: CLIENT,
    // "No `infiniteQueryOptions` call site exists under packages/client/src" — there are SIX, so the control
    // is all six. Neutralising one would leave five and prove the opposite of what the arm claims.
    overlays: [
      blank("packages/client/src/features/databank/surfaces/databank-library-surface.tsx"),
      blank("packages/client/src/features/chat/hooks/use-chat-list-collection.ts"),
      blank("packages/client/src/features/discovery/components/corpus-browse-view.tsx"),
      blank("packages/client/src/features/character/surfaces/character-library-surface.tsx"),
      blank("packages/client/src/components/character-picker.tsx"),
      blank("packages/client/src/data/create-collection-surface.ts"),
    ],
    messageIncludes: "DERIVED NOTHING",
  },
  {
    policy: ctPollHealth,
    globs: CT_ANCHOR,
    // The population is exactly one named anchor file; the health arm derives its facts from that file, so
    // blanking it is the whole control.
    overlays: [{ kind: "neutralise", path: "tests/client/lib/motion-stats.ct.tsx", source: "export const neutralised = 1;\n" }],
    messageIncludes: "no freshly-minted poll schedule",
  },
];

test("every declared final policy reports a real-corpus positive control (#2149)", ({ repoRoot }) => {
  const fired = assertRealCorpusLivenessArms(repoRoot, ARMS);
  // THE DENOMINATOR. A helper that silently skipped an arm would run zero `expect`s for it and this suite
  // would be green — the same shape as the dead policies the whole mechanism exists to find.
  expect([...fired.keys()].toSorted((a, b) => a.localeCompare(b))).toEqual(ARMS.map((arm) => arm.policy.id).toSorted((a, b) => a.localeCompare(b)));
});
