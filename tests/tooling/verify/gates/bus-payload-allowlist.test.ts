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
const RPG_BUS = "packages/contracts/src/rpg/bus.ts";
const AUTOMATION = "packages/contracts/src/automation/index.ts";

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
  // The #1030 F4 population widening: both roots must resolve or the blindness arm reds — which is exactly
  // how this fixture caught the widening the moment it landed.
  [RPG_BUS]: 'export type RpgBusEvent = { type: "gameChanged"; chatId: string };\n',
  [AUTOMATION]: 'export type AutomationBusEvent = { type: "ruleFired"; chatId: string; ruleId: string };\n',
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

// ── #1024: an OPEN KEY SPACE on a wire event (index signature / `Record` / mapped type / `unknown`) ────
// RED-FIRST: every case below returned ZERO findings against the pre-#1024 gate — `getProperties()` skips
// index signatures outright, and a field's own spelled type was never judged at all.

test("an INDEX SIGNATURE on a named wire event is refused — getProperties() never saw it", () => {
  const found = findings({
    [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; chatId: string; [k: string]: string };\n',
  });
  expect(found.map((f) => f.token)).toEqual(["unsupported-shape:IndexSignature"]);
});

test("an index signature on an INHERITED carrier interface is refused at its declaring site", () => {
  const found = findings({
    "packages/contracts/src/events/open-carrier.ts": "export interface OpenCarrier {\n  readonly [k: string]: string;\n}\n",
    [EVENTS]:
      'import type { OpenCarrier } from "./open-carrier.ts";\nexport interface CharacterUpdatedEvent extends OpenCarrier {\n  readonly type: "character.updated";\n}\n',
  });
  expect(found).toHaveLength(1);
  expect(found[0]?.token).toBe("unsupported-shape:IndexSignature");
  expect(found[0]?.file).toBe("packages/contracts/src/events/open-carrier.ts");
});

test("a `Record<string, …>` FIELD is refused — an open bag carries a secret under a name the predicate cannot read", () => {
  const found = findings({
    [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; chatId: string; meta: Record<string, string> };\n',
  });
  expect(found.map((f) => f.token)).toEqual(["unsupported-shape:Record"]);
});

test("an `unknown` field is refused, and so is a mapped-type event body", () => {
  expect(findings({ [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; chatId: string; blob: unknown };\n' }).map((f) => f.token)).toEqual([
    "unsupported-shape:unknown",
  ]);
  expect(findings({ [CHAT_BUS]: "export type ChatBusEvent = { [K in string]: string };\n" }).map((f) => f.token)).toEqual(["unsupported-shape:MappedType"]);
});

test("an INLINE nested object literal's keys are on the wire under the event's own name and ARE scanned", () => {
  const found = findings({
    [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; chatId: string; payload: { apiKey: string } };\n',
  });
  expect(found.map((f) => f.token)).toEqual(["apiKey"]);
});

test("a NAMED reference stays undescended — the boundary #948 declared is not widened by the open-shape check", () => {
  const gateResult = result({
    [CHAT_BUS]:
      'export interface MessageView {\n  readonly apiKey: string;\n  readonly meta: Record<string, string>;\n}\nexport type ChatBusEvent = { type: "x"; chatId: string; view?: MessageView };\n',
  });
  expect(gateResult.findings).toEqual([]);
  expect(gateResult.scan.declared?.unit).toContain("refPayloadsNotFollowed=1");
});

// ── #1025: the notification zod arm resolves IMPORTED schema objects ──────────────────────────────────
// RED-FIRST: the pre-#1025 arm read literal `z.object({…})` calls only, so every imported-initializer case
// below returned ZERO findings while the credential shipped on the durable inbox wire.

test("an IMPORTED schema used directly as a notification arm is resolved — its credential key is reported at the carrier", () => {
  const found = findings({
    "packages/contracts/src/notifications/leaky-base.ts":
      'import { z } from "zod";\nexport const leakyBase = z.object({ type: z.literal("leak"), apiKey: z.string() });\n',
    [NOTIFICATIONS]:
      'import { z } from "zod";\nimport { leakyBase } from "./leaky-base.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", [leakyBase]);\n',
  });
  expect(found).toHaveLength(1);
  expect(found[0]?.token).toBe("apiKey");
  expect(found[0]?.file).toBe("packages/contracts/src/notifications/leaky-base.ts");
});

test("an imported base reached through `.extend({…})` contributes BOTH sides' keys", () => {
  const found = findings({
    "packages/contracts/src/notifications/base.ts":
      'import { z } from "zod";\nexport const inboxBase = z.object({ recipientUserId: z.string(), sessionToken: z.string() });\n',
    [NOTIFICATIONS]:
      'import { z } from "zod";\nimport { inboxBase } from "./base.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", [inboxBase.extend({ password: z.string() })]);\n',
  });
  expect(found.map((f) => f.token).sort()).toEqual(["password", "sessionToken"]);
});

test("an object SPREAD of an imported schema's `.shape` is resolved, not silently dropped", () => {
  const found = findings({
    "packages/contracts/src/notifications/base.ts": 'import { z } from "zod";\nexport const inboxBase = z.object({ apiKey: z.string() });\n',
    [NOTIFICATIONS]:
      'import { z } from "zod";\nimport { inboxBase } from "./base.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", [z.object({ ...inboxBase.shape, type: z.literal("x") })]);\n',
  });
  expect(found.map((f) => f.token)).toEqual(["apiKey"]);
});

test("an imported schema carrying only SANCTIONED fields passes — the resolver widens what is SEEN, never what is flagged", () => {
  const gateResult = result({
    "packages/contracts/src/notifications/base.ts":
      'import { z } from "zod";\nexport const inboxBase = z.object({ recipientUserId: z.string(), chatId: z.string() });\n',
    [NOTIFICATIONS]:
      'import { z } from "zod";\nimport { inboxBase } from "./base.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", [inboxBase.extend({ inviteId: z.string() })]);\n',
  });
  expect(gateResult.findings).toEqual([]);
  expect(gateResult.scan.declared?.unit).toContain("carriers=1");
});

test("an arm imported through a specifier this pure-AST harness cannot resolve FAILS CLOSED", () => {
  const found = findings({
    [NOTIFICATIONS]:
      'import { z } from "zod";\nimport { farBase } from "@orb/contracts/elsewhere";\nexport const notificationEventSchema = z.discriminatedUnion("type", [farBase]);\n',
  });
  expect(found.map((f) => f.token)).toEqual(["unresolved-schema:farBase"]);
});

test("an arm that admits unknown keys (`.loose()`) is refused — the open-key-space rule on the zod side", () => {
  const found = findings({
    [NOTIFICATIONS]:
      'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("x") }).loose()]);\n',
  });
  expect(found.map((f) => f.token)).toEqual(["unsupported-shape:z.loose"]);
});

test("a nested `z.object` in a property VALUE still contributes its keys (the live `source` shape)", () => {
  const found = findings({
    [NOTIFICATIONS]:
      'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [\n  z.object({ type: z.literal("x"), source: z.discriminatedUnion("kind", [z.object({ kind: z.literal("rule"), apiKey: z.string() })]) }),\n]);\n',
  });
  expect(found.map((f) => f.token)).toEqual(["apiKey"]);
});

// ── #1030 F1/F2/F3: the residual holes the #948 security verification measured ─────────────────────────

test("F1: an index signature reached through an INTERSECTION carrier is refused, not silently skipped", () => {
  const found = findings({
    "packages/contracts/src/events/open-part.ts": "export interface OpenPart {\n  readonly [k: string]: string;\n}\n",
    [EVENTS]: 'import type { OpenPart } from "./open-part.ts";\nexport type DomainEvent = { readonly type: "x" } & OpenPart;\n',
  });
  expect(found.map((f) => f.token)).toEqual(["unsupported-shape:IndexSignature"]);
});

test("F2: a MERGED carrier walks EVERY declaration — `find()` read only the first and missed the secret", () => {
  const found = findings({
    "packages/contracts/src/events/merged-carrier.ts":
      "export interface MergedCarrier {\n  readonly emittedAt: number;\n}\nexport interface MergedCarrier {\n  readonly apiKey: string;\n}\n",
    [EVENTS]:
      'import type { MergedCarrier } from "./merged-carrier.ts";\nexport interface CharacterUpdatedEvent extends MergedCarrier {\n  readonly type: "character.updated";\n}\n',
  });
  expect(found.map((f) => f.token)).toEqual(["apiKey"]);
});

test("F3: a root that resolves to ZERO wire members REDS — a refactor cannot silently empty the denominator", () => {
  // The schema still parses, the NAME still resolves (so the §4.6 blindness arm stays quiet by design) and
  // no shape is refused — the denominator just went to nothing. That is the hole this arm exists for.
  const zodSide = findings({
    [NOTIFICATIONS]: 'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", []);\n',
  });
  expect(zodSide).toHaveLength(1);
  expect(zodSide[0]?.message).toContain("ZERO wire members");
  expect(zodSide[0]?.message).toContain('"notificationEventSchema"');
  // The type side of the same hole: a root hollowed out to a memberless shape.
  const typeSide = findings({ [CHAT_BUS]: "export type ChatBusEvent = never;\n" });
  expect(typeSide).toHaveLength(1);
  expect(typeSide[0]?.message).toContain('"ChatBusEvent"');
});

test("F3: a root REFUSED out loud does not ALSO trip the empty-denominator alarm — one defect, one finding", () => {
  const found = findings({
    "packages/contracts/src/notifications/moved.ts": 'import { z } from "zod";\nexport const armsMovedAway = z.tuple([z.string()]);\n',
    [NOTIFICATIONS]:
      'import { z } from "zod";\nimport { armsMovedAway } from "./moved.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", armsMovedAway);\n',
  });
  expect(found.map((f) => f.token)).toEqual(["unsupported-shape:non-literal-arms"]);
});

test("F3: a root whose members all live on OTHER named roots does not trip the zero-member alarm", () => {
  // `DomainEvent`'s live shape: every arm is itself a named root, walked from its own declaration. The alarm
  // must count that deferral as a contribution or it is a standing false positive on the real tree.
  const found = findings({
    [EVENTS]:
      'export interface CharacterUpdatedEvent {\n  readonly type: "character.updated";\n}\nexport interface AssetCreatedEvent {\n  readonly type: "asset.created";\n}\nexport type DomainEvent = CharacterUpdatedEvent | AssetCreatedEvent;\n',
  });
  expect(found).toEqual([]);
});
