// The PERMANENT pin for the #948 transitive member reader (GATE-AUTHORING.md §5: a one-shot probe proves
// the day it ran; a committed one keeps proving). The gate's conformance rows prove the matcher; this proves
// the two halves that a mini-project alone cannot state — the DECLARED counts it reports through `ctx.scan`
// (the semantic denominator: a drop is invisible in the file count) and the exact boundary between what the
// reader follows (the named event's own type IDENTITY) and what it refuses to follow (a field's TYPE).
//
// RED-FIRST: every `extends`/aliased-arm case here returned ZERO findings against the pre-#948 gate — that
// was the leak (docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md).
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePassResult } from "../../../../tooling/src/verify/contract/pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/bus-payload-allowlist.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const EVENTS = "packages/contracts/src/events/index.ts";
const CHAT_BUS = "packages/contracts/src/chat/bus.ts";
const USER_BUS = "packages/contracts/src/user-bus/index.ts";
const NOTIFICATIONS = "packages/contracts/src/notifications/index.ts";
const WORLD_INFO = "packages/contracts/src/world-info/index.ts";

/** The sanctioned `credentialId` field, so the STALE arm stays quiet in a tree that loads the anchor. */
const LIVE_USER_BUS = 'export type UserBusEvent = { type: "credentialsChanged"; credentialId?: string };\n';
const LIVE_WORLD_INFO = 'export type WiBusEvent = { type: "wi.updated"; bookId: string };\n';

function result(files: Readonly<Record<string, string>>): GatePassResult {
  const { project, root } = ctxFor(files);
  const pass = runPass([gate], {
    root,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  const [first] = pass.gates;
  if (first === undefined) {
    throw new Error("bus-payload-allowlist did not run — the pass returned no gate result");
  }
  return first;
}

function findings(files: Readonly<Record<string, string>>): readonly Finding[] {
  return result(files).findings;
}

test("a credential inherited from an IMPORTED carrier is reported at its declaring site", () => {
  const found = findings({
    "packages/contracts/src/events/secret-carrier.ts": "export interface SecretCarrier {\n  readonly apiKey: string;\n}\n",
    [EVENTS]:
      'import type { SecretCarrier } from "./secret-carrier.ts";\nexport interface CharacterUpdatedEvent extends SecretCarrier {\n  readonly type: "character.updated";\n}\n',
  });
  expect(found).toHaveLength(1);
  expect(found[0]?.token).toBe("apiKey");
  expect(found[0]?.file).toBe("packages/contracts/src/events/secret-carrier.ts");
});

test("a UNION ARM that aliases an imported declaration is part of the event's identity and is scanned", () => {
  const found = findings({
    "packages/contracts/src/events/leaked-arm.ts": 'export interface LeakedArm {\n  readonly type: "leaked";\n  readonly sessionToken: string;\n}\n',
    [EVENTS]:
      'import type { LeakedArm } from "./leaked-arm.ts";\nexport interface CharacterUpdatedEvent {\n  readonly type: "character.updated";\n}\nexport type DomainEvent = CharacterUpdatedEvent | LeakedArm;\n',
  });
  expect(found.map((f) => f.token)).toEqual(["sessionToken"]);
});

test("a SAME-FILE union arm outside the root name set is scanned — the live DomainEvent shape", () => {
  // `PersonaUpdatedEvent`/`WorldInfoUpdatedEvent` are real `DomainEvent` arms that the pre-#948 name-keyed
  // reader never looked at. This is that shape, with a planted secret in the un-named arm.
  const found = findings({
    [EVENTS]:
      'export interface CharacterUpdatedEvent {\n  readonly type: "character.updated";\n}\nexport interface PersonaUpdatedEvent {\n  readonly type: "persona.updated";\n  readonly personaSecret: string;\n}\nexport type DomainEvent = CharacterUpdatedEvent | PersonaUpdatedEvent;\n',
  });
  expect(found.map((f) => f.token)).toEqual(["personaSecret"]);
});

test("an inherited NON-secret field passes — the reader widens what is SEEN, never what is flagged", () => {
  const found = findings({
    "packages/contracts/src/events/base-event.ts": "export interface StampedEvent {\n  readonly emittedAt: number;\n}\n",
    [EVENTS]:
      'import type { StampedEvent } from "./base-event.ts";\nexport interface CharacterUpdatedEvent extends StampedEvent {\n  readonly type: "character.updated";\n}\n',
  });
  expect(found).toEqual([]);
});

test("THE PRESERVED BOUNDARY: a field's TYPE is not descended, and the run says how much it left alone", () => {
  const gateResult = result({
    [CHAT_BUS]:
      'export interface MessageView {\n  readonly cacheReadTokens: number;\n  readonly apiKey: string;\n}\nexport type ChatBusEvent = { type: "messageCommitted"; chatId: string; view?: MessageView };\n',
  });
  expect(gateResult.findings).toEqual([]);
  expect(gateResult.scan.declared?.unit).toContain("refPayloadsNotFollowed=1");
});

test("an UNRESOLVABLE base fails closed — the gate cannot prove no credential hides behind it", () => {
  const found = findings({
    [EVENTS]: 'export interface CharacterUpdatedEvent extends UnknowableBase {\n  readonly type: "character.updated";\n}\n',
  });
  expect(found.map((f) => f.token)).toEqual(["unresolved-base:UnknowableBase"]);
});

test("the declared census splits LOCAL from INHERITED members and names the carrier count", () => {
  const gateResult = result({
    "packages/contracts/src/events/base-event.ts": "export interface StampedEvent {\n  readonly emittedAt: number;\n}\n",
    [EVENTS]:
      'import type { StampedEvent } from "./base-event.ts";\nexport interface CharacterUpdatedEvent extends StampedEvent {\n  readonly type: "character.updated";\n}\n',
  });
  expect(gateResult.scan.declared?.unit).toContain("events=1 local=1 inherited=1 carriers=1");
});

/** A whole workspace's worth of files, so the §4.6 blindness sweep's REAL_CORPUS_MIN anchor engages. This
 *  is the substrate gate-conformance cannot provide (its mini-projects hold a handful of files), which is
 *  why the sweep's two directions are pinned here rather than as conformance rows. */
function padded(files: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = { ...files };
  for (let i = 0; i < 60; i += 1) {
    out[`packages/contracts/src/filler/f${i}.ts`] = `export type Filler${i} = string;\n`;
  }
  return out;
}

/** Every named root resolving, on a corpus big enough to engage the blindness sweep. */
const HEALTHY_CORPUS: Readonly<Record<string, string>> = {
  [CHAT_BUS]: 'export type ChatBusEvent = { type: "turnStarted"; chatId: string };\n',
  [USER_BUS]: LIVE_USER_BUS,
  [NOTIFICATIONS]:
    'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("invite") })]);\n',
  [EVENTS]:
    'export interface CharacterUpdatedEvent {\n  readonly type: "character.updated";\n}\nexport interface AssetCreatedEvent {\n  readonly type: "asset.created";\n}\nexport type DomainEvent = CharacterUpdatedEvent | AssetCreatedEvent;\n',
  [WORLD_INFO]: LIVE_WORLD_INFO,
};

test("a healthy real-sized corpus is CLEAN — the blindness sweep is not a standing false positive", () => {
  expect(findings(padded(HEALTHY_CORPUS))).toEqual([]);
});

test("a root name RENAMED AWAY reds the blindness arm — the gate detects its own blindness", () => {
  const found = findings(padded({ ...HEALTHY_CORPUS, [WORLD_INFO]: 'export type WiBusEventRenamed = { type: "wi.updated"; bookId: string };\n' }));
  expect(found).toHaveLength(1);
  expect(found[0]?.message).toContain("blindness tripwire");
  expect(found[0]?.message).toContain('"WiBusEvent"');
});

test("a MOVED bus home reds every name it declared — the guard is rename-proof, not a file list", () => {
  // The hole an "every bus file loaded" guard would have had: the home moves, its declarations vanish, and
  // the sweep abstains exactly when it was needed. `WiBusEvent` is gone with its file, so it must RED.
  const { [WORLD_INFO]: moved, ...rest } = HEALTHY_CORPUS;
  const found = findings(padded({ ...rest, "packages/contracts/src/world-info/bus.ts": moved ?? "" }));
  expect(found).toHaveLength(1);
  expect(found[0]?.message).toContain('"WiBusEvent"');
});

test("the blindness arm ABSTAINS on a conformance-sized project — a mini-project is not a rename", () => {
  const found = findings({ [WORLD_INFO]: LIVE_WORLD_INFO, [USER_BUS]: LIVE_USER_BUS });
  expect(found).toEqual([]);
});
