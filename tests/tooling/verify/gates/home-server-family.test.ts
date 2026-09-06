// The sanctioned-home SERVER family (#1584): ten legacy gates whose exceptions were recurring repository
// PERMISSIONS carried in gate-local `SANCTIONED_HOMES`/allowlist tables, converted to reviewed-grant policies
// whose exceptions live in the ONE central grant table — plus the hard `scrubber-factory-home` sibling split
// off `scrubber-home` because a definition site's liveness is a completeness claim and not a permission.
//
// Beyond the per-policy proofs this file pins the two things a proof CANNOT: the receipt refusals (a policy
// whose home or vocabulary stopped resolving must WITHHOLD its verdict rather than render a clean pass) and
// the grant liveness (a row consumed zero times is STALE; a row that would match two findings is OVER-BROAD,
// which is why every policy here reports once per `(subject, operation)`).
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
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

const FAMILY_TIMEOUT_MS = 300_000;
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

const ROLE_HOME = "packages/contracts/src/identity/index.ts";
const PARTICIPANT_VOCABULARY =
  'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n';
const ENFORCEMENT =
  'import type { ParticipantRole } from "../../../../../contracts/src/identity/index.ts";\nexport function f(m: { role: ParticipantRole }): void {\n  if (m.role !== "host") {\n    throw new Error("nope");\n  }\n}\n';

test.each([
  ["absent", { [ROLE_HOME]: "export const OTHER = 1;\n" }],
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

const EMITTER_DOOR = 'import { EventEmitter } from "node:events";\n';
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
