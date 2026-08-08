// Contract tests for @orb/contracts/automation (D46 rider slice): the two trigger tuples the
// `automation_rules` paired CHECK derives (membership pinned — v1 + reserved, per 01 §1), the
// bus-discriminated trigger schema (a cross-bus trigger name fails to parse), and the fire-outcome
// tuple the `automation_fires` CHECK derives.

import type { AutomationActionType, ChatTriggerType, DomainTriggerType, TriggerFact } from "@orb/contracts/automation";
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_FIRE_OUTCOMES,
  AUTOMATION_TRIGGER_BUSES,
  automationActionSchema,
  automationActionsSchema,
  automationFireOutcomeSchema,
  automationTriggerSchema,
  CHAT_TRIGGER_TYPES,
  DOMAIN_TRIGGER_TYPES,
  GLOBAL_VARIABLE_KEY_MAX_CHARS,
  globalVariableKeySchema,
  LIVE_TRIGGERS,
  triggerFactSchema,
} from "@orb/contracts/automation";
import { expect, test } from "../../support/fixtures.ts";

test("CHAT_TRIGGER_TYPES is the pinned 15-member chat-bus subset (v1 + reserved, 01 §1)", () => {
  expect(CHAT_TRIGGER_TYPES).toEqual([
    "chatOpened",
    "messageCommitted",
    "messageEdited",
    "variantSelected",
    "turnStarted",
    "turnCompleted",
    "turnAborted",
    "worldInfoActivated",
    "personaSwitched",
    "chatCreated",
    "messageHidden",
    "messagesDeleted",
    "chatUpdated",
    "wiEntryAttached",
    "wiEntryDetached",
  ]);
  // Permanently EXCLUDED members must never creep in (excluded ≠ reserved — 01 §1).
  expect(CHAT_TRIGGER_TYPES).not.toContain("delta");
  expect(CHAT_TRIGGER_TYPES).not.toContain("warning");
  expect(CHAT_TRIGGER_TYPES).not.toContain("chatDeleted");
});

test("DOMAIN_TRIGGER_TYPES is the pinned 2-member domain-bus subset (v1)", () => {
  expect(DOMAIN_TRIGGER_TYPES).toEqual(["character.updated", "asset.created"]);
});

test("automationTriggerSchema discriminates on bus and refuses a cross-bus trigger name", () => {
  expect(automationTriggerSchema.parse({ bus: "chat", type: "chatOpened" })).toEqual({
    bus: "chat",
    type: "chatOpened",
  });
  expect(automationTriggerSchema.parse({ bus: "domain", type: "asset.created" })).toEqual({
    bus: "domain",
    type: "asset.created",
  });
  // The chat bus does not admit domain trigger names (and vice versa) — the db CHECK mirrors this.
  expect(automationTriggerSchema.safeParse({ bus: "chat", type: "character.updated" }).success).toBe(false);
  expect(automationTriggerSchema.safeParse({ bus: "domain", type: "messageCommitted" }).success).toBe(false);
  expect(automationTriggerSchema.safeParse({ bus: "plugin", type: "chatOpened" }).success).toBe(false);
});

test("AUTOMATION_TRIGGER_BUSES mirrors the trigger union's discriminant set", () => {
  expect(AUTOMATION_TRIGGER_BUSES).toEqual(["chat", "domain"]);
});

test("globalVariableKeySchema rejects empty + over-cap keys (02 §4)", () => {
  expect(globalVariableKeySchema.safeParse("streak").success).toBe(true);
  expect(globalVariableKeySchema.safeParse("").success).toBe(false);
  expect(globalVariableKeySchema.safeParse("k".repeat(GLOBAL_VARIABLE_KEY_MAX_CHARS)).success).toBe(true);
  expect(globalVariableKeySchema.safeParse("k".repeat(GLOBAL_VARIABLE_KEY_MAX_CHARS + 1)).success).toBe(false);
});

test("AUTOMATION_FIRE_OUTCOMES is the pinned 8-member dispatch-terminal set (04 §1)", () => {
  expect(AUTOMATION_FIRE_OUTCOMES).toEqual([
    "fired",
    "predicate_false",
    "predicate_error",
    "budget_refused",
    "depth_refused",
    "action_error",
    "authority_refused",
    "test_run",
  ]);
  expect(automationFireOutcomeSchema.options).toEqual(AUTOMATION_FIRE_OUTCOMES);
  expect(automationFireOutcomeSchema.safeParse("skipped").success).toBe(false);
});

// Exhaustiveness backstops — a tuple edit without touching these Records is a tsc error, so the inline
// literals above cannot silently drift (the workloads KIND_SEEN pattern).
const CHAT_SEEN: Record<ChatTriggerType, true> = {
  chatOpened: true,
  messageCommitted: true,
  messageEdited: true,
  variantSelected: true,
  turnStarted: true,
  turnCompleted: true,
  turnAborted: true,
  worldInfoActivated: true,
  personaSwitched: true,
  chatCreated: true,
  messageHidden: true,
  messagesDeleted: true,
  chatUpdated: true,
  wiEntryAttached: true,
  wiEntryDetached: true,
};
const DOMAIN_SEEN: Record<DomainTriggerType, true> = {
  "character.updated": true,
  "asset.created": true,
};

test("the trigger unions have no member beyond their tuples", () => {
  expect(Object.keys(CHAT_SEEN).sort()).toEqual(CHAT_TRIGGER_TYPES.toSorted());
  expect(Object.keys(DOMAIN_SEEN).sort()).toEqual(DOMAIN_TRIGGER_TYPES.toSorted());
});

// ── the action union + liveness (A4 — 03 / 01 §1) ────────────────────────────────────────────────

test("AUTOMATION_ACTION_TYPES is the pinned 8-member live arm set", () => {
  expect(AUTOMATION_ACTION_TYPES).toEqual([
    "set_variable",
    "transform_draft",
    "insert_world_info_entry",
    "surface_quick_reply",
    "post_notification",
    "trigger_turn",
    "generate_image",
    "set_chat_background",
  ]);
});

test("LIVE_TRIGGERS marks the v1 tuple members live and every reserved member not-live (exhaustive)", () => {
  // Exhaustive over BOTH tuples — a new tuple member without a liveness entry is a tsc error at the source.
  expect(Object.keys(LIVE_TRIGGERS).sort()).toEqual([...CHAT_TRIGGER_TYPES, ...DOMAIN_TRIGGER_TYPES].sort());
  expect(LIVE_TRIGGERS.chatOpened).toBe(true);
  expect(LIVE_TRIGGERS["asset.created"]).toBe(true);
  // Reserved members are typed-but-not-wired.
  expect(LIVE_TRIGGERS.messageHidden).toBe(false);
});

test("automationActionSchema parses each live arm; the generate_image arm imports the imagery args (mode default)", () => {
  expect(automationActionSchema.parse({ type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim" }).type).toBe("set_variable");
  expect(automationActionSchema.parse({ type: "post_notification", recipient: "host", messageTemplate: "hi" }).type).toBe("post_notification");
  // generate_image derives its shape from @orb/contracts/imagery (no inline re-spell) — the arm applies the
  // imagery `mode` default of "scenario".
  const img = automationActionSchema.parse({ type: "generate_image" });
  expect(img).toMatchObject({ type: "generate_image", mode: "scenario", n: 1, reuse: "prefer" });
});

test("automationActionsSchema enforces the 1..8 arm cap", () => {
  const arm = { type: "set_variable" as const, scope: "chat" as const, key: "k", op: "set" as const, value: "v" };
  expect(automationActionsSchema.safeParse([]).success).toBe(false);
  expect(automationActionsSchema.safeParse([arm]).success).toBe(true);
  expect(automationActionsSchema.safeParse(Array.from({ length: 8 }, () => arm)).success).toBe(true);
  expect(automationActionsSchema.safeParse(Array.from({ length: 9 }, () => arm)).success).toBe(false);
});

// Compile-time exhaustiveness: `AutomationActionType` derives from the tuple, so a member the runtime
// `toEqual` above missed is caught here — `assertActionType` accepts only a real member, and every arm
// listed is checked against the type (a tuple edit that drops a member fails tsc at the corresponding line).
function assertActionType(t: AutomationActionType): AutomationActionType {
  return t;
}

test("every arm id is a real AutomationActionType (compile + runtime pin)", () => {
  const seen = AUTOMATION_ACTION_TYPES.map((t) => assertActionType(t));
  expect(seen).toEqual([...AUTOMATION_ACTION_TYPES]);
});

// ── TF-1: triggerFactSchema — the guest-marshalling contract (01 §2 / plugin-design 04 §P4) ────────

test("triggerFactSchema round-trips a full fact (every trigger-type projection)", () => {
  const message: TriggerFact = {
    type: "messageCommitted",
    bus: "chat",
    chatId: "chat_abc",
    message: { id: "msg_1", role: "user", authorUserId: "user_1", characterId: null, seq: 3, content: "hello" },
  };
  expect(triggerFactSchema.parse(message)).toEqual(message);

  const turn: TriggerFact = {
    type: "turnAborted",
    bus: "chat",
    chatId: "chat_abc",
    turn: { intent: "send", api: "", source: "", model: "", speakerCharacterId: null, abortReason: "user_stop", automationDepth: 1 },
  };
  expect(triggerFactSchema.parse(turn)).toEqual(turn);

  // A minimal chat-scope fact (chatOpened) and a chat-less domain fact both parse.
  expect(triggerFactSchema.parse({ type: "chatOpened", bus: "chat", chatId: "chat_abc" }).chatId).toBe("chat_abc");
  expect(triggerFactSchema.parse({ type: "character.updated", bus: "domain", chatId: null, characterId: "char_9" }).characterId).toBe("char_9");
  expect(triggerFactSchema.parse({ type: "worldInfoActivated", bus: "chat", chatId: "c", worldInfo: { entryIds: ["e1", "e2"] } }).worldInfo?.entryIds).toEqual([
    "e1",
    "e2",
  ]);
});

test("triggerFactSchema is STRUCTURED-CLONE clean — no branded transform, so parse ≡ structuredClone", () => {
  // The realm boundary marshals via structured-clone; the schema must be lossless (no `.transform()` that
  // would rewrite a value differently than the clone) so a parsed fact equals its cloned self.
  const fact: TriggerFact = {
    type: "personaSwitched",
    bus: "chat",
    chatId: "chat_x",
    persona: { from: null, to: "persona_2" },
  };
  const parsed = triggerFactSchema.parse(fact);
  expect(parsed).toEqual(structuredClone(fact));
  // Every id crosses as a BARE string (no brand survives the wire) — a plain string chatId is accepted.
  expect(triggerFactSchema.safeParse({ type: "chatOpened", bus: "chat", chatId: "not-a-typeid" }).success).toBe(true);
});

test("triggerFactSchema refuses a malformed / off-taxonomy fact at the trust edge", () => {
  expect(triggerFactSchema.safeParse({ type: "chatOpened", bus: "plugin", chatId: null }).success).toBe(false); // bad bus
  expect(triggerFactSchema.safeParse({ type: "messageCommitted", bus: "chat" }).success).toBe(false); // chatId required (nullable, not optional)
  expect(
    triggerFactSchema.safeParse({
      type: "messageCommitted",
      bus: "chat",
      chatId: "c",
      message: { id: "m", role: "root", authorUserId: null, characterId: null, seq: 1, content: "x" },
    }).success,
  ).toBe(false); // bad role
  expect(
    triggerFactSchema.safeParse({ type: "t", bus: "chat", chatId: "c", turn: { intent: "send", api: "", source: "", model: "", speakerCharacterId: null } })
      .success,
  ).toBe(false); // turn.automationDepth required
});
