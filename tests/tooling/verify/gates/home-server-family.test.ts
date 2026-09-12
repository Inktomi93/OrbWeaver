// The sanctioned-home SERVER family (#1584): ten legacy gates whose exceptions were recurring repository
// PERMISSIONS carried in gate-local `SANCTIONED_HOMES`/allowlist tables, converted to reviewed-grant policies
// whose exceptions live in the ONE central grant table — plus the hard `scrubber-factory-home` sibling split
// off `scrubber-home` because a definition site's liveness is a completeness claim and not a permission.
//
// Beyond the per-policy proofs this file pins the two things a proof CANNOT: the receipt refusals (a policy
// whose home or vocabulary stopped resolving must WITHHOLD its verdict rather than render a clean pass) and
// the grant liveness (a row consumed zero times is STALE; a row that would match two findings is OVER-BROAD).
//
// §4.3 IS TABLE-DRIVEN, AND THE TABLE IS HELD TOTAL. `runPolicyPass` pins `reviewedGrants: []` inside a
// module's own proof rows, so a reviewed-grant policy's `(subject, operation)` grain, its STALE alarm and
// its over-broad behaviour cannot be proven by ANY `mustFlag`/`mustPass` row — the pin exists only if it
// exists here. This file used to claim grant liveness for "every policy here" and had it for ONE of ten
// (wave-8 D7, `docs/reviews/gate-runtime/v-audit-wave8-2026-09-12.md:289`). It is now a `GRANT_CASES` table
// with three arms per policy — exact consumption, WRONG operation, RENAMED subject — plus a completeness
// test asserting the table's policy set EQUALS the family's reviewed-grant set, so a twelfth sanctioned-home
// policy added to `FAMILY` without a grant case REDS rather than inheriting a claim nobody checked. That
// completeness assertion is the part worth copying: the claim in this header is true because a test holds
// it, not because someone wrote it down.
//
// `bus-channel-primitive` keeps its three bespoke blocks BELOW the table as well. They carry what the table
// deliberately does not: the OVER-BROAD case (two constructions in one granted home stay ONE consumption)
// and a stale arm driven from a home that stopped constructing rather than from a mismatched key.
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { trpcServerProof } from "../../../../tooling/src/verify/gates/_proof/server-vendors.ts";
import { gate as busChannelPrimitive } from "../../../../tooling/src/verify/gates/bus-channel-primitive.ts";
import { gate as contentPartSeam } from "../../../../tooling/src/verify/gates/content-part-seam.ts";
import { gate as noDirectUsersRead } from "../../../../tooling/src/verify/gates/no-direct-users-read.ts";
import { gate as noRawClock } from "../../../../tooling/src/verify/gates/no-raw-clock.ts";
import { gate as noRawRandom } from "../../../../tooling/src/verify/gates/no-raw-random.ts";
import { gate as ownerRoleSplit } from "../../../../tooling/src/verify/gates/owner-role-split.ts";
import { gate as scrubberFactoryHome } from "../../../../tooling/src/verify/gates/scrubber-factory-home.ts";
import { gate as scrubberHome } from "../../../../tooling/src/verify/gates/scrubber-home.ts";
import { gate as singleStreamTransport } from "../../../../tooling/src/verify/gates/single-stream-transport.ts";
import { gate as soleEnvReader } from "../../../../tooling/src/verify/gates/sole-env-reader.ts";
import { gate as twoClassRoleAuthority } from "../../../../tooling/src/verify/gates/two-class-role-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY_TIMEOUT_MS = scaledBudget(300_000);
const ROOT = "/home-server-family";

const FAMILY: readonly GatePolicy[] = [
  busChannelPrimitive,
  contentPartSeam,
  noDirectUsersRead,
  noRawClock,
  noRawRandom,
  ownerRoleSplit,
  scrubberFactoryHome,
  scrubberHome,
  singleStreamTransport,
  soleEnvReader,
  twoClassRoleAuthority,
];

test(
  "every sanctioned-home policy judges declaration homes and vocabularies rather than written names",
  () => {
    expect(verifyPolicyProofs([...FAMILY])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>, grants: readonly ReviewedGateGrant[] = []): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: grants, failOnWarnings: false });
}

const CONTENT_PART = "export type ChatContentPart = { readonly type: string };\n";
const CONSUMER = 'import type { ChatContentPart } from "../../../../../contracts/src/chat/bus.ts";\nexport type T = ChatContentPart;\n';

// The two role vocabularies share ONE declaration home, which is the whole reason the `role-vocabulary`
// family judges the AXIS by type rather than the tuple by path.
const IDENTITY_HOME = "packages/contracts/src/identity/index.ts";
const USER_VOCABULARY = 'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n';
const PARTICIPANT_VOCABULARY =
  'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n';
const LATTICE_COMPARISON =
  'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nexport const isOwner = (r: { role: UserRole }): boolean => r.role === "owner";\n';
const ENFORCEMENT =
  'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(m: { role: ParticipantRole }): void {\n  if (m.role !== "host") {\n    throw new Error("nope");\n  }\n}\n';
const EMITTER_DOOR = 'import { EventEmitter } from "node:events";\n';
const SCRUBBER_FACTORY =
  "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n";

/** One reviewed-grant policy, a fixture that produces EXACTLY ONE finding, and the `(subject, operation)`
 *  pair that finding carries. Every arm below is driven from this, so a policy cannot be covered on one
 *  axis and silently uncovered on the others. */
interface GrantCase {
  readonly policy: GatePolicy;
  readonly files: Readonly<Record<string, string>>;
  readonly subject: string;
  readonly operation: string;
}

const GRANT_CASES: readonly GrantCase[] = [
  {
    policy: busChannelPrimitive,
    files: { "packages/server/src/transport/trpc/rogue.ts": `${EMITTER_DOOR}export const bus = new EventEmitter();\n` },
    subject: "packages/server/src/transport/trpc/rogue.ts",
    operation: "event-emitter-construction",
  },
  {
    policy: contentPartSeam,
    files: { "packages/contracts/src/chat/bus.ts": CONTENT_PART, "packages/server/src/domain/chat/verbs/reach.ts": CONSUMER },
    subject: "packages/server/src/domain/chat/verbs/reach.ts",
    operation: "chat-content-part-reference",
  },
  {
    policy: noDirectUsersRead,
    files: {
      "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
      "packages/server/src/domain/billing/x.ts": 'import { users } from "../../../../db/src/schema/users.ts";\nexport const u = users;\n',
    },
    subject: "packages/server/src/domain/billing/x.ts",
    operation: "users-table-reference",
  },
  {
    policy: noRawClock,
    files: { "packages/server/src/domain/feature/logic.ts": "export function doThing(): number {\n  return Date.now();\n}\n" },
    subject: "packages/server/src/domain/feature/logic.ts",
    operation: "ambient-clock-read",
  },
  {
    policy: noRawRandom,
    files: { "packages/server/src/domain/feature/logic.ts": "export function rollDice(): number {\n  return Math.random();\n}\n" },
    subject: "packages/server/src/domain/feature/logic.ts",
    operation: "ambient-entropy-draw",
  },
  {
    policy: ownerRoleSplit,
    files: { [IDENTITY_HOME]: USER_VOCABULARY, "packages/server/src/domain/hub/x.ts": LATTICE_COMPARISON },
    subject: "packages/server/src/domain/hub/x.ts",
    operation: "global-role-comparison",
  },
  {
    policy: scrubberHome,
    files: {
      "packages/kit/src/content/index.ts": SCRUBBER_FACTORY,
      "packages/server/src/transport/trpc/leak.ts":
        'import { createHiddenSpanStreamScrubber } from "../../../../kit/src/content/index.ts";\nexport const s = createHiddenSpanStreamScrubber();\n',
    },
    subject: "packages/server/src/transport/trpc/leak.ts",
    operation: "hidden-span-scrubber-construction",
  },
  {
    policy: singleStreamTransport,
    files: {
      // The SAME vendor plant the module's own rows resolve against — a second spelling of the door here
      // would let the family test and the proof rows disagree about what `@trpc/server` ships.
      ...trpcServerProof(),
      "packages/server/src/transport/trpc/routers/probe.ts":
        'import { authedProcedure, router } from "@trpc/server";\nexport const probeRouter = router({ live: authedProcedure.subscription(() => null) });\n',
    },
    subject: "packages/server/src/transport/trpc/routers/probe.ts",
    operation: "sse-subscription:live",
  },
  {
    policy: soleEnvReader,
    files: {
      "packages/server/src/domain/hub/door.ts": 'import process from "node:process";\nexport const x = process.env["OWNER_HANDLES"];\n',
    },
    subject: "packages/server/src/domain/hub/door.ts",
    operation: "process-env-read:OWNER_HANDLES",
  },
  {
    policy: twoClassRoleAuthority,
    files: { [IDENTITY_HOME]: PARTICIPANT_VOCABULARY, "packages/server/src/domain/chat/verbs/gate.ts": ENFORCEMENT },
    subject: "packages/server/src/domain/chat/verbs/gate.ts",
    operation: "enforcement-role-comparison",
  },
];

function grantFor(input: GrantCase, overrides: Partial<ReviewedGateGrant> = {}): ReviewedGateGrant {
  return {
    id: `${input.policy.id}:family-fixture`,
    policyId: input.policy.id,
    subject: input.subject,
    operation: input.operation,
    why: "the fixture twin of this policy's live central row.",
    endsWhen: "the home moves or stops doing the thing.",
    ...overrides,
  };
}

const GRANT_ROWS = GRANT_CASES.map((input) => [input.policy.id, input] as const);

test("the grant-identity table covers EVERY reviewed-grant policy in this family", () => {
  const covered = GRANT_CASES.map((input) => input.policy.id).toSorted();
  const owed = FAMILY.filter((policy) => policy.authority === "reviewed-grant")
    .map((policy) => policy.id)
    .toSorted();

  // The header's claim about grant liveness is true because THIS assertion holds it. A new sanctioned-home
  // policy added to FAMILY without a GRANT_CASES row reds here rather than inheriting an unchecked claim.
  expect(covered).toEqual(owed);
});

test.each(GRANT_ROWS)("%s: its reviewed grant licenses the exact (subject, operation) pair, once", (_id, input) => {
  const granted = passOf(input.policy, input.files, [grantFor(input)]);

  expect(granted.toolErrors).toEqual([]);
  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.grantedFindings).toHaveLength(1);
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: `${input.policy.id}:family-fixture`, count: 1 }]);
  expect(granted.authority.authorityAlarms).toEqual([]);
});

test.each(GRANT_ROWS)("%s: a grant naming the WRONG OPERATION licenses nothing and goes STALE", (_id, input) => {
  // The identity is the PAIR. A row whose subject is right and whose operation drifted — the shape a
  // renamed proc, a re-grained per-key read or a re-spelled construction produces — must license nothing
  // AND say so, rather than silently covering a finding it no longer describes.
  const wrong = passOf(input.policy, input.files, [grantFor(input, { operation: `${input.operation}-no-longer-this` })]);

  expect(wrong.toolErrors).toEqual([]);
  expect(wrong.authority.effectiveFindings).toMatchObject([{ policyId: input.policy.id, subject: input.subject }]);
  expect(wrong.authority.grantedFindings).toEqual([]);
  expect(wrong.authority.authorityAlarms).toMatchObject([
    { kind: "stale-reviewed-grant", policyId: input.policy.id, grantId: `${input.policy.id}:family-fixture` },
  ]);
});

test.each(GRANT_ROWS)("%s: a grant whose SUBJECT was renamed licenses nothing and goes STALE — the rename tripwire", (_id, input) => {
  // This is the legacy `SANCTIONED_HOMES` rename arm, owned centrally: the day a sanctioned home moves, its
  // row is consumed zero times and the finding at the NEW path is effective. A population subtraction could
  // never have said either half.
  const renamed = passOf(input.policy, input.files, [grantFor(input, { subject: input.subject.replace(/\.ts$/u, ".moved.ts") })]);

  expect(renamed.toolErrors).toEqual([]);
  expect(renamed.authority.effectiveFindings).toMatchObject([{ policyId: input.policy.id, subject: input.subject }]);
  expect(renamed.authority.grantedFindings).toEqual([]);
  expect(renamed.authority.authorityAlarms).toMatchObject([
    { kind: "stale-reviewed-grant", policyId: input.policy.id, grantId: `${input.policy.id}:family-fixture` },
  ]);
});

test("the D51 seam WITHHOLDS its verdict when the content-part declaration leaves its home", () => {
  const healthy = passOf(contentPartSeam, {
    "packages/contracts/src/chat/bus.ts": CONTENT_PART,
    "packages/server/src/domain/chat/verbs/reach.ts": CONSUMER,
  });
  expect(healthy.toolErrors).toEqual([]);
  expect(healthy.policies[0]?.receipts).toEqual([{ kind: "population", source: "ChatContentPart declaration home", members: 1, unresolved: 0 }]);
  expect(healthy.authority.effectiveFindings).toMatchObject([{ policyId: "content-part-seam", subject: "packages/server/src/domain/chat/verbs/reach.ts" }]);

  // The declaration moved OUT of the chat contracts home: every reference now resolves foreign, so the
  // policy would find nothing and render a clean pass over a rule that has no subject left.
  const moved = passOf(contentPartSeam, {
    "packages/contracts/src/wire/bus.ts": CONTENT_PART,
    "packages/server/src/domain/chat/verbs/reach.ts":
      'import type { ChatContentPart } from "../../../../../contracts/src/wire/bus.ts";\nexport type T = ChatContentPart;\n',
  });
  expect(moved.toolErrors).toMatchObject([{ policyId: "content-part-seam", phase: "receipt", message: expect.stringContaining("declaration home") }]);
  expect(moved.authority.withheldPolicyIds).toEqual(["content-part-seam"]);
  expect(moved.authority.effectiveFindings).toEqual([]);
});

test("the scrubber's DEFINITION home refuses when its directory holds no source, and reports when the export is gone", () => {
  const gone = passOf(scrubberFactoryHome, { "packages/kit/src/time/index.ts": "export const nowMs = (): number => 0;\n" });
  expect(gone.toolErrors).toMatchObject([{ policyId: "scrubber-factory-home", phase: "receipt", message: expect.stringContaining("kit content home") }]);
  expect(gone.authority.withheldPolicyIds).toEqual(["scrubber-factory-home"]);

  const renamed = passOf(scrubberFactoryHome, { "packages/kit/src/content/index.ts": "export const stripHiddenSpans = (text: string): string => text;\n" });
  expect(renamed.toolErrors).toEqual([]);
  expect(renamed.authority.effectiveFindings).toMatchObject([{ policyId: "scrubber-factory-home" }]);
});

test.each([
  ["absent", { [IDENTITY_HOME]: "export const OTHER = 1;\n" }],
  ["relocated", { "packages/server/src/domain/chat/roles.ts": PARTICIPANT_VOCABULARY }],
] as const)("a participant-role vocabulary that is %s withholds the authority verdict instead of passing", (_label, vocabulary) => {
  const result = passOf(twoClassRoleAuthority, { ...vocabulary, "packages/server/src/domain/chat/verbs/gate.ts": ENFORCEMENT });

  // The vocabulary is the policy's literal set. Absent or declared elsewhere it is the same blindness, and a
  // policy cannot render a clean verdict over a vocabulary it could not read.
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ policyId: "two-class-role-authority", phase: "receipt", message: expect.stringContaining("PARTICIPANT_ROLES") }]);
  expect(result.authority.withheldPolicyIds).toEqual(["two-class-role-authority"]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

// THE TWIN'S PIN COVERS THE TWIN, AND NOTHING ELSE. `owner-role-split` ends `evaluate` with the identical
// `if (members.size === 0) { return; }` after the identical receipt helper, and its header makes the identical
// claim — *a vocabulary that stops resolving takes the receipt to zero and WITHHOLDS the verdict* — with no
// pin of its own: a `throw` planted in that branch fired on ZERO of its 13 declared rows (wave-8 D8,
// `docs/reviews/gate-runtime/v-audit-wave8-2026-09-12.md:326`). The mechanism is shared, which is an argument
// and not a receipt, so the arms are driven separately against the OTHER vocabulary.
test.each([
  ["absent", { [IDENTITY_HOME]: "export const OTHER = 1;\n" }],
  ["relocated", { "packages/server/src/domain/admin/roles.ts": USER_VOCABULARY }],
] as const)("a global-role vocabulary that is %s withholds the privilege verdict instead of passing", (_label, vocabulary) => {
  const result = passOf(ownerRoleSplit, { ...vocabulary, "packages/server/src/domain/hub/x.ts": LATTICE_COMPARISON });

  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ policyId: "owner-role-split", phase: "receipt", message: expect.stringContaining("USER_ROLES") }]);
  expect(result.authority.withheldPolicyIds).toEqual(["owner-role-split"]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

const MINT = "packages/server/src/transport/trpc/bus-channel.ts";
const MINT_GRANT: ReviewedGateGrant = {
  id: "bus-channel-primitive:bus-channel-mint",
  policyId: "bus-channel-primitive",
  subject: MINT,
  operation: "event-emitter-construction",
  why: "the mint's own module — the fixture twin of the live central row.",
  endsWhen: "the mint moves.",
};

test("a reviewed grant licenses its exact subject, and TWO constructions in that home stay ONE consumption", () => {
  const granted = passOf(busChannelPrimitive, { [MINT]: `${EMITTER_DOOR}export const a = new EventEmitter();\nexport const b = new EventEmitter();\n` }, [
    MINT_GRANT,
  ]);

  // The whole reason findings dedupe per carrier: a second finding with the same identity would make this
  // row OVER-BROAD, and an over-broad row licenses NEITHER finding.
  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.grantedFindings).toHaveLength(1);
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: MINT_GRANT.id, count: 1 }]);
  expect(granted.authority.authorityAlarms).toEqual([]);
});

test("a grant whose home no longer constructs is STALE after a complete run — the rename tripwire, centrally", () => {
  const stale = passOf(busChannelPrimitive, { [MINT]: "export const bus = null;\n", "packages/server/src/transport/trpc/other.ts": "export const x = 1;\n" }, [
    MINT_GRANT,
  ]);

  expect(stale.toolErrors).toEqual([]);
  expect(stale.authority.effectiveFindings).toEqual([]);
  expect(stale.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", policyId: "bus-channel-primitive", grantId: MINT_GRANT.id }]);
});

test("a grant naming another subject licenses nothing — the identity is the pair, not the policy", () => {
  const elsewhere = passOf(busChannelPrimitive, { "packages/server/src/transport/trpc/rogue.ts": `${EMITTER_DOOR}export const bus = new EventEmitter();\n` }, [
    MINT_GRANT,
  ]);

  expect(elsewhere.authority.effectiveFindings).toMatchObject([{ policyId: "bus-channel-primitive", subject: "packages/server/src/transport/trpc/rogue.ts" }]);
  expect(elsewhere.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: MINT_GRANT.id }]);
});
