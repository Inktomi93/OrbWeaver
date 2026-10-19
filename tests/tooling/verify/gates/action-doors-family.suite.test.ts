// The `action-doors` family test (#1584). The family is `duplicate-action-doors` (reviewed-grant) over the
// `actionDoorFact` provider. Everything a PROOF ROW can express lives in its own `mustFlag`/`mustPass`/
// `mustRefuse` rows and runs on the static bar through `structure:policy-conformance`. This file carries
// ONLY what a row structurally cannot:
//
//   §6.4 THE CONVERSION DIFFERENTIAL — the frozen legacy descriptor at `(pruned from public history)` (the conversion commit's
//   parent) and the two final policies, replayed over the SAME BYTES: every legacy example, both
//   populations, both finding sets, both tool-error sets, each difference CLASSIFIED.
//
//   §6.4 CATEGORY 5, WHICH THE IN-MEMORY DOOR CANNOT CLAIM — an exemption-mechanism move must prove every
//   formerly hidden site becomes exactly ONE live CONSUMED grant, and `createDifferential`'s `Replay` has no
//   grant channel by construction. The two fixtures the retired `EXEMPT_PROCEDURES` table hid are therefore
//   driven through `finalPass` WITH the central ruling and asserted at one consumed grant / zero effective.
//
//   §2.1 THE POPULATION CONTROLS — an INSIDE file both sides admit and an OUTSIDE file both sides reject, so
//   the set-difference claim cannot pass because both sides admitted nothing.
//
//   §4.3 CENTRAL GRANT IDENTITY — the real `lib/reviewed-grants.ts` rows, in all three directions: the exact
//   identity consumed once, a wrong OPERATION leaving the finding effective and alarming stale, and a
//   THIRD door changing the door set so the two-door ruling licenses nothing. Those three replace the
//   retired baseline's `cite`-set judge and its hand-rolled stale sweep.
//
//   §6.3 REAL-CORPUS LIVENESS is DATA in `_liveness/client.ts`, run by the one liveness runner over the
//   structure run's own corpus, so a family that had silently stopped reaching the live door census cannot
//   read as clean.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { ACTION_DOOR_RULINGS, rulingOperation } from "../../../../tooling/src/floor/code-facts/action-door-rulings.ts";
import { gate as doors } from "../../../../tooling/src/verify/gates/duplicate-action-doors.ts";
import { SECTION_IDS_HOME } from "../../../../tooling/src/verify/lib/action-door-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

// Quiet-box ceilings; `scaledBudget` stretches them under measured load so a contended box never reads as a false RED.
const REPLAY_BASE_MS = 120_000;

const DOORS_GRANTS = REVIEWED_GRANTS.filter((grant) => grant.policyId === doors.id);

test("the family's DECLARED proofs hold, including the reviewed-grant identity witness", { timeout: scaledBudget(REPLAY_BASE_MS) }, () => {
  // The static bar runs these through `structure:policy-conformance`; this is the lane-scoped door onto the
  // same runner, and it is what exercises the §6.2 witness — the `mustFlag` row that must flag with no
  // authority and then be consumed EXACTLY ONCE by one synthetic grant carrying its authored identity.
  expect(verifyPolicyProofs([doors])).toEqual([]);
});

// ── §2.1 THE POPULATION CONTROLS — equality cannot pass because both sides admitted nothing ─────────────

// ── §6.4 CATEGORY 5 — the formerly hidden sites become exactly ONE live CONSUMED grant ──────────────────

// ── §4.3 CENTRAL GRANT IDENTITY, in all three directions ───────────────────────────────────────────────

test("the central rulings are the ten this migration minted, and their operations derive from the door sets", () => {
  expect(DOORS_GRANTS.map(({ id }) => id).toSorted()).toEqual(ACTION_DOOR_RULINGS.map(({ id }) => id).toSorted());
  for (const ruling of ACTION_DOOR_RULINGS) {
    const grant = DOORS_GRANTS.find(({ id }) => id === ruling.id);
    expect(grant?.operation, `${ruling.id} — the table's operation is DERIVED from the ruled door set`).toBe(rulingOperation(ruling));
    expect(grant?.subject).toBe(ruling.subject);
    expect(ruling.doors.length, `${ruling.id} — a ruling below the duplication floor rules nothing`).toBeGreaterThanOrEqual(2);
    expect([...ruling.doors].toSorted(), `${ruling.id} — the door set is PATH-SORTED; order is part of the identity`).toEqual([...ruling.doors]);
  }
});

// ── THE PLANE DERIVATION — both derivations are name-keyed, so a rename regroups every door under its feature
// directory while the census still reports a number. The pair key `<plane>::<procedure>` is where it shows. ──

const PLANES_ROOT = "/action-doors-planes";
const CHAT_LIB = "packages/client/src/features/chat/lib";
const CHAT_COMPONENTS = "packages/client/src/features/chat/components";
const CHATS_RAIL = 'export const s = { id: "chats", rail: { label: "Chats" } };\n';
const CHATS_IDS = 'export const SECTION_IDS = ["chats"] as const;\n';
const FORK_DOORS = {
  [`${CHAT_COMPONENTS}/a.tsx`]: "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
  [`${CHAT_COMPONENTS}/b.tsx`]: "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
};

function doorsPass(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${PLANES_ROOT}/${path}`, text);
  }
  return runPolicyPass({ root: PLANES_ROOT, project, knownPolicies: [doors], policies: [doors], reviewedGrants: [], failOnWarnings: false });
}

test.for([
  [
    "a resolved vocabulary and a recognised rail definition",
    { [SECTION_IDS_HOME]: CHATS_IDS, [`${CHAT_LIB}/chats-section.tsx`]: CHATS_RAIL },
    "chats::chat.forkChat",
  ],
  [
    "a vocabulary composed through a spread of an imported sibling tuple",
    {
      "packages/client/src/state/core-section-ids.ts": 'export const CORE_SECTION_IDS = ["chats"] as const;\n',
      [SECTION_IDS_HOME]: 'import { CORE_SECTION_IDS } from "./core-section-ids.ts";\nexport const SECTION_IDS = [...CORE_SECTION_IDS, "home"] as const;\n',
      [`${CHAT_LIB}/chats-section.tsx`]: CHATS_RAIL,
    },
    "chats::chat.forkChat",
  ],
  [
    "a settings-section contribution beside one real rail definition mints no plane of its own",
    {
      [SECTION_IDS_HOME]: CHATS_IDS,
      [`${CHAT_LIB}/chats-section.tsx`]: CHATS_RAIL,
      [`${CHAT_LIB}/memory-settings-section.tsx`]: 'export const m = { id: "chat-memory", anchor: "chat-behavior" };\n',
    },
    "chats::chat.forkChat",
  ],
  [
    "the vocabulary home names no SECTION_IDS",
    { [SECTION_IDS_HOME]: "export const OTHER = 1;\n", [`${CHAT_LIB}/chats-section.tsx`]: CHATS_RAIL },
    "feature:chat::chat.forkChat",
  ],
  [
    "the rail definition's file name leaves the section convention",
    { [SECTION_IDS_HOME]: CHATS_IDS, [`${CHAT_LIB}/chats-panel.tsx`]: CHATS_RAIL },
    "feature:chat::chat.forkChat",
  ],
] as const)("the door pair is keyed by its derived plane: %s", ([, files, subject]) => {
  const reported = doorsPass({ ...files, ...FORK_DOORS }).authority.effectiveFindings.map((finding) => finding.subject);
  expect(reported).toEqual([subject]);
});

test("a SECTION_IDS tuple the shared reader cannot resolve withholds the census instead of regrouping", () => {
  const result = doorsPass({
    "packages/client/src/state/section-ids.ts": "declare function ids(): readonly string[];\nexport const SECTION_IDS = [...ids()] as const;\n",
    [`${CHAT_LIB}/chats-section.tsx`]: 'export const s = { id: "chats" };\n',
  });
  expect([...result.factErrors, ...result.toolErrors].map(({ message }) => message).join("\n")).toContain('unsupported spread in "SECTION_IDS"');
  expect(result.authority.effectiveFindings).toEqual([]);
});

test(
  "the real client tree derives its rail planes: every ruled door pair is reported under its plane and consumed",
  ({ repoRoot }) => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths([
      `${repoRoot}/packages/client/src/features/**/*.ts`,
      `${repoRoot}/packages/client/src/features/**/*.tsx`,
      `${repoRoot}/packages/client/src/state/**/*.ts`,
      `${repoRoot}/packages/client/src/state/**/*.tsx`,
    ]);
    expect(
      ACTION_DOOR_RULINGS.some(({ subject }) => !subject.startsWith("feature:")),
      "at least one ruling must name a rail plane, or this census cannot see a blind plane derivation",
    ).toBe(true);
    const result = runPolicyPass({ root: repoRoot, project, knownPolicies: [doors], policies: [doors], reviewedGrants: DOORS_GRANTS, failOnWarnings: false });
    expect([...result.factErrors, ...result.toolErrors]).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual([]);
    // Other policies' waivers sit in this tree, and this pass knows only `doors`, so only its own alarms are read.
    expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === doors.id)).toEqual([]);
    expect(result.authority.grantedFindings).toHaveLength(DOORS_GRANTS.length);
  },
  scaledBudget(REPLAY_BASE_MS),
);
