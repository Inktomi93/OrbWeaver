// The `bus-payload` family test (#1584). The family is `bus-payload-allowlist` (reviewed-grant) +
// `bus-payload-allowlist-health` (hard) over one shared `busPayloadFact` provider, and everything a PROOF
// ROW can express now lives in their own `mustFlag`/`mustPass` rows and runs on the static bar through
// `structure:policy-conformance`. This file carries ONLY what a row structurally cannot:
//
//   §4.3 CENTRAL GRANT IDENTITY — module rows prove an authored identity against a synthetic grant. This
//   family also proves that the actual central `credentialId` row is consumed exactly once, that a wrong
//   OPERATION leaves its finding effective, and that a renamed SUBJECT alarms. Those three replace the legacy
//   `SANCTIONED_FIELDS` table and its hand-rolled two-sided stale sweep, so they are pinned in all three
//   directions here.
//
//   THE BLINDNESS SWEEP — it abstains below `REAL_CORPUS_MIN` files, and a conformance mini-project holds a
//   handful, so no proof row can drive it in either direction. This is the substrate that can: a padded
//   `@contracts` corpus, with the healthy case, a RENAMED root, and a MOVED HOME (the hole an
//   "every bus file loaded" guard would have had — the home moves, its declarations vanish, and the sweep
//   abstains exactly when it was needed).
//
//   §2149 REAL-CORPUS LIVENESS — a virtual overlay on the REPOSITORY's own contracts, so a family that had
//   silently stopped reaching the live bus unions cannot read as clean. It also pins the member census and
//   the grant consumption against the real tree, which is where the population port's byte-identity claim
//   (259 members, both sides) is actually checkable.
//
// RED-FIRST HERITAGE: the `extends`/aliased-arm and open-key-space behaviours these fixtures assume were
// each measured returning ZERO findings against the pre-#948/#1024/#1066 gate. Those defect proofs are now
// the two modules' own conformance rows; what survives here is only the part a row cannot reach.
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as busPayloadAllowlist } from "../../../../tooling/src/verify/gates/bus-payload-allowlist.ts";
import { gate as busPayloadHealth } from "../../../../tooling/src/verify/gates/bus-payload-allowlist-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");
const CHAT_BUS = "packages/contracts/src/chat/bus.ts";
const USER_BUS = "packages/contracts/src/user-bus/index.ts";
const EVENTS = "packages/contracts/src/events/index.ts";
const NOTIFICATIONS = "packages/contracts/src/notifications/index.ts";
const WORLD_INFO = "packages/contracts/src/world-info/index.ts";
const RPG_BUS = "packages/contracts/src/rpg/bus.ts";
const AUTOMATION = "packages/contracts/src/automation/index.ts";
const WORKLOADS = "packages/contracts/src/workloads/events.ts";

const CREDENTIAL_GRANT = REVIEWED_GRANTS.filter((grant) => grant.policyId === busPayloadAllowlist.id);

/** The sanctioned `credentialId` field — the subject the one grant row licenses. */
const LIVE_USER_BUS = 'export type UserBusEvent = { type: "credentialsChanged"; credentialId?: string };\n';

/** Every named root resolving, on a corpus big enough to engage the blindness sweep. Both #1030 F4 homes
 *  and the #1047 workloads home are here because each is a ROOT NAME: the sweep reds unless the corpus
 *  declares it, which is exactly how this fixture catches a widening the day it lands. */
const HEALTHY_CORPUS: Readonly<Record<string, string>> = {
  [CHAT_BUS]: 'export type ChatBusEvent = { type: "turnStarted"; chatId: string };\n',
  [USER_BUS]: LIVE_USER_BUS,
  [NOTIFICATIONS]:
    'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("invite") })]);\n',
  [EVENTS]:
    'export interface CharacterUpdatedEvent {\n  readonly type: "character.updated";\n}\nexport interface AssetCreatedEvent {\n  readonly type: "asset.created";\n}\nexport type DomainEvent = CharacterUpdatedEvent | AssetCreatedEvent;\n',
  [WORLD_INFO]: 'export type WiBusEvent = { type: "wi.updated"; bookId: string };\n',
  [RPG_BUS]: 'export type RpgBusEvent = { type: "gameChanged"; chatId: string };\n',
  [AUTOMATION]: 'export type AutomationBusEvent = { type: "ruleFired"; chatId: string; ruleId: string };\n',
  [WORKLOADS]: 'export type WorkloadEvent = { type: "started"; workloadId: string };\n',
};

/** A whole workspace's worth of files, so `REAL_CORPUS_MIN` engages. */
function padded(files: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = { ...files };
  for (let index = 0; index < 60; index += 1) {
    out[`packages/contracts/src/filler/f${index}.ts`] = `export type Filler${index} = string;\n`;
  }
  return out;
}

function run(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  grants: readonly ReviewedGateGrant[] = [],
): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  const root = "/orb-bus-payload-family";
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, content, { overwrite: true });
  }
  return runPolicyPass({
    knownPolicies: policies,
    policies,
    root,
    project,
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

// ── §4.3 GRANT IDENTITY — the successor to the legacy SANCTIONED_FIELDS table, in all three directions ──

test("the credential grant is ONE row, and it is the exact identity the policy reports", () => {
  // Two-sided against the table itself: the legacy exemption was ONE field with ONE cite, so a second row
  // appearing here means a sanction was minted without passing through this test's judgement.
  expect(CREDENTIAL_GRANT.map(({ subject, operation }) => [subject, operation])).toEqual([["credentialId", "bus-payload-field"]]);
});

test("the intended grant is consumed EXACTLY ONCE and licenses the finding", () => {
  const result = run([busPayloadAllowlist], { [USER_BUS]: LIVE_USER_BUS }, CREDENTIAL_GRANT);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.grantedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("a WRONG OPERATION licenses nothing — the finding stays effective and the row alarms", () => {
  const wrong = CREDENTIAL_GRANT.map((grant) => ({ ...grant, operation: "some-other-act" }));
  const result = run([busPayloadAllowlist], { [USER_BUS]: LIVE_USER_BUS }, wrong);

  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toContain("stale-reviewed-grant");
});

test("a RENAMED SUBJECT stales the row — this is the successor to the legacy two-sided stale sweep", () => {
  // The loaded-gun case the legacy table's stale arm existed to catch: the sanction survives as a standing
  // permission on a NAME nothing declares any more, so the day a real secret is spelled that way it ships
  // silently. The central engine alarms instead, and it does so without needing a real-tree anchor to know
  // whether it is allowed to speak — which the legacy arm did need.
  const result = run([busPayloadAllowlist], { [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; chatId: string };\n' }, CREDENTIAL_GRANT);

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

// ── THE BLINDNESS SWEEP — needs a padded corpus, which no conformance fixture can be ──

test("a healthy real-sized corpus is CLEAN — the blindness sweep is not a standing false positive", () => {
  const result = run([busPayloadHealth], padded(HEALTHY_CORPUS));

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("a root name RENAMED AWAY reds the blindness arm — the family detects its own blindness", () => {
  const result = run(
    [busPayloadHealth],
    padded({ ...HEALTHY_CORPUS, [WORLD_INFO]: 'export type WiBusEventRenamed = { type: "wi.updated"; bookId: string };\n' }),
  );
  const findings = result.authority.effectiveFindings;

  expect(findings).toHaveLength(1);
  expect(findings[0]?.message).toContain("blindness tripwire");
  expect(findings[0]?.message).toContain('"WiBusEvent"');
});

test("a MOVED bus home reds every name it declared — the guard is rename-proof, not a file list", () => {
  // The hole an "every bus file loaded" guard would have had: the home moves, its declarations vanish, and
  // the sweep abstains exactly when it was needed.
  const { [WORLD_INFO]: moved, ...rest } = HEALTHY_CORPUS;
  const result = run([busPayloadHealth], padded({ ...rest, "packages/contracts/src/world-info/bus.ts": moved ?? "" }));
  const findings = result.authority.effectiveFindings;

  expect(findings).toHaveLength(1);
  expect(findings[0]?.message).toContain('"WiBusEvent"');
  // AND IT ANCHORS SOMEWHERE REPORTABLE. An absence verdict owns no path, so `subjectAnchor` picks the
  // first present bus home — the row that dies if the tripwire is re-anchored on its own missing subject.
  expect(findings[0]?.file).toBe(CHAT_BUS);
});

test("the blindness arm ABSTAINS on a conformance-sized project — a mini-project is not a rename", () => {
  const result = run([busPayloadHealth], { [WORLD_INFO]: HEALTHY_CORPUS[WORLD_INFO] ?? "", [USER_BUS]: LIVE_USER_BUS });

  expect(result.authority.effectiveFindings).toEqual([]);
});

test("a root REFUSED out loud does not ALSO trip the empty-denominator alarm — one defect, one finding", () => {
  // The two tripwires overlap by construction: a root whose only content is an unresolvable base yields no
  // member AND was refused. Counting the refusal as a contribution is what keeps it one finding, and this
  // is the row that dies if `contributionMark` stops counting refusals.
  const result = run([busPayloadHealth], {
    [EVENTS]: 'export interface CharacterUpdatedEvent extends Unknowable {\n  readonly type: "character.updated";\n}\n',
  });
  const findings = result.authority.effectiveFindings;

  expect(findings).toHaveLength(1);
  expect(findings[0]?.message).toContain("Shape: unresolved-base:Unknowable.");
});

test("a root whose members all live on OTHER named roots does not trip the zero-member alarm", () => {
  // `DomainEvent` contributes no field of its own — it defers to two named roots — and deferral IS a
  // contribution. Without that clause every union-of-named-roots on the tree would red.
  const result = run([busPayloadHealth], {
    [EVENTS]:
      'export interface CharacterUpdatedEvent {\n  readonly type: "character.updated";\n  readonly characterId: string;\n}\nexport interface AssetCreatedEvent {\n  readonly type: "asset.created";\n  readonly assetId: string;\n}\nexport type DomainEvent = CharacterUpdatedEvent | AssetCreatedEvent;\n',
  });

  expect(result.authority.effectiveFindings).toEqual([]);
});

test("the allowlist receipts an empty field census honestly and the runtime withholds its verdict", () => {
  const result = run([busPayloadAllowlist], { "packages/contracts/src/settings/index.ts": "export type SomeOtherThing = string;\n" });

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toContain(busPayloadAllowlist.id);
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]?.phase).toBe("receipt");
  expect(result.toolErrors[0]?.message).toContain('population "bus-payload-allowlist" resolved zero members');
});

// ── §2149 REAL-CORPUS LIVENESS — silent-because-dead cannot pass as silent-because-clean ──

function runOverReal(overlay: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(`${REPO_ROOT}/packages/contracts/src/**/*.ts`);
  for (const [path, content] of Object.entries(overlay)) {
    project.createSourceFile(`${REPO_ROOT}/${path}`, content, { overwrite: true });
  }
  return runPolicyPass({
    knownPolicies: [busPayloadAllowlist, busPayloadHealth],
    policies: [busPayloadAllowlist, busPayloadHealth],
    root: REPO_ROOT,
    project,
    reviewedGrants: CREDENTIAL_GRANT,
    failOnWarnings: false,
  });
}

test("the family reaches a verdict on the REAL contracts corpus, and the one live grant is consumed there", () => {
  const result = runOverReal({});

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  // The live tree's ONE credential-word field is the sanctioned `credentialId`, licensed by the one row.
  // A zero here would mean the family had stopped reaching the real unions — the liveness claim.
  expect(result.authority.grantedFindings).toHaveLength(1);
  // Scoped to THIS family's alarms on purpose: `runPolicyPass` pins `knownPolicies` to the policies it was
  // handed, so every OTHER policy's live `@orb-waive` marker in `@orb/contracts` alarms as `unknown-policy`
  // here. That is the harness's documented shape, not a finding about this family — the whole-corpus
  // reconciliation is `pnpm check:structure`, which runs the complete roster and is clean.
  expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === busPayloadAllowlist.id || policyId === busPayloadHealth.id)).toEqual([]);
  const receipts = result.policies.flatMap(({ receipts: rows }) => rows);
  const census = receipts.find(({ source }) => source === busPayloadAllowlist.id);
  // The census the legacy descriptor reported through `ctx.scan` as `259/259 wire-event member`. Asserting
  // a FLOOR rather than the literal keeps a legitimate new bus member from redding this test while still
  // failing loudly on a reader that went blind; the exact number is the commit's population receipt.
  expect(census?.kind === "population" ? census.members : 0).toBeGreaterThan(200);
});

test("a credential planted on a REAL bus union is reported through the policy", () => {
  // The overlay replaces the live world-info bus home with one carrying a secret. If the family had
  // silently stopped reaching the real unions this stays green, which is the whole point of the row.
  const result = runOverReal({ [WORLD_INFO]: 'export type WiBusEvent = { type: "wi.updated"; bookId: string; apiKey: string };\n' });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(["apiKey"]);
});
