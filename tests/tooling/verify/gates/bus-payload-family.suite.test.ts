// Singleton source-shape health: preserve refusal, empty-root and whole-corpus blindness evidence.
// Native type subjects own resolved secret fields; the retained provider still owns source-only refusals.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as busPayloadHealth } from "../../../../tooling/src/verify/gates/bus-payload-allowlist-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");
const CHAT_BUS = "packages/contracts/src/chat/bus.ts";
const USER_BUS = "packages/contracts/src/user-bus/index.ts";
const EVENTS = "packages/contracts/src/events/index.ts";
const NOTIFICATIONS = "packages/contracts/src/notifications/index.ts";
const WORLD_INFO = "packages/contracts/src/world-info/index.ts";
const RPG_BUS = "packages/contracts/src/rpg/bus.ts";
const AUTOMATION = "packages/contracts/src/automation/index.ts";
const WORKLOADS = "packages/contracts/src/workloads/events.ts";

// A closed user event supplies the health fixture's own root, not permission for raw credential IDs.
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

function run(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
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
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test(
  "source-shape health retains every declared policy proof",
  () => {
    expect(verifyPolicyProofs([busPayloadHealth])).toEqual([]);
  },
  scaledBudget(30_000),
);

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

// ── §2149 REAL-CORPUS LIVENESS — silent-because-dead cannot pass as silent-because-clean ──

function runOverReal(overlay: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(`${REPO_ROOT}/packages/contracts/src/**/*.ts`);
  for (const [path, content] of Object.entries(overlay)) {
    project.createSourceFile(`${REPO_ROOT}/${path}`, content, { overwrite: true });
  }
  return runPolicyPass({
    knownPolicies: [busPayloadHealth],
    policies: [busPayloadHealth],
    root: REPO_ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("source-shape health reaches a complete verdict on the actual contracts corpus", () => {
  const result = runOverReal({});
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === busPayloadHealth.id)).toEqual([]);
});
