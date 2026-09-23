// Contract tests for @orb/contracts/automation (D46 rider slice): the two trigger tuples the
// `automation_rules` paired CHECK derives (membership pinned — v1 + reserved, per 01 §1), the
// bus-discriminated trigger schema (a cross-bus trigger name fails to parse), and the fire-outcome
// tuple the `automation_fires` CHECK derives.

import type { AutomationActionType, ChatTriggerType, DomainTriggerType, TriggerFact } from "@orb/contracts/automation";
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR,
  AUTOMATION_FIRE_OUTCOMES,
  AUTOMATION_OWNER_BUDGET_DEFAULTS,
  AUTOMATION_TRIGGER_BUSES,
  automationActionSchema,
  automationActionsSchema,
  automationFireOutcomeSchema,
  automationTriggerFor,
  automationTriggerSchema,
  CHAT_TRIGGER_TYPES,
  DOMAIN_TRIGGER_TYPES,
  GLOBAL_VARIABLE_KEY_MAX_CHARS,
  globalVariableKeySchema,
  isConfirmFirstArm,
  LIVE_TRIGGERS,
  QUICK_REPLY_MODES,
  SPEND_ARM_TYPES,
  triggerBusOf,
  triggerFactSchema,
} from "@orb/contracts/automation";
import { DOMAIN_EVENT_TYPES } from "@orb/contracts/events";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

test("CHAT_TRIGGER_TYPES is the pinned 16-member chat-bus subset (v1 + reserved, 01 §1)", () => {
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
    // S7 (wired with B6) — the reaction plane. LIVE, not reserved.
    "reactionsChanged",
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

test("S7: DOMAIN_TRIGGER_TYPES carries ALL FOUR live domain events — the tuple no longer trails its own bus", () => {
  expect(DOMAIN_TRIGGER_TYPES).toEqual(["character.updated", "asset.created", "persona.updated", "world-info.updated"]);
  // THE PROPERTY, not the list: the trigger vocabulary IS the domain bus's own union. The tuple sat at two
  // members while the bus grew to four (2026-08-14, the entity→room freshness bridge), so a rule could not
  // watch a persona or a lorebook edit at all. Deriving the assertion from `DOMAIN_EVENT_TYPES` is what
  // keeps the two from parting again — a fifth bus member reds HERE, not at the next reader's surprise.
  expect(DOMAIN_TRIGGER_TYPES.toSorted()).toEqual(DOMAIN_EVENT_TYPES.toSorted());
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
  reactionsChanged: true,
  messageHidden: true,
  messagesDeleted: true,
  chatUpdated: true,
  wiEntryAttached: true,
  wiEntryDetached: true,
};
const DOMAIN_SEEN: Record<DomainTriggerType, true> = {
  "character.updated": true,
  "asset.created": true,
  "persona.updated": true,
  "world-info.updated": true,
};

test("the trigger unions have no member beyond their tuples", () => {
  expect(Object.keys(CHAT_SEEN).sort()).toEqual(CHAT_TRIGGER_TYPES.toSorted());
  expect(Object.keys(DOMAIN_SEEN).sort()).toEqual(DOMAIN_TRIGGER_TYPES.toSorted());
});

// ── the action union + liveness (A4 — 03 / 01 §1) ────────────────────────────────────────────────

test("AUTOMATION_ACTION_TYPES is the pinned 10-member live arm set", () => {
  expect(AUTOMATION_ACTION_TYPES).toEqual([
    "set_variable",
    "transform_draft",
    "insert_world_info_entry",
    "surface_quick_reply",
    "post_notification",
    "trigger_turn",
    "generate_image",
    "set_chat_background",
    // S5 (C1) — the quiet-analysis arm, first-party, BEFORE run_tool so the boundary member stays last.
    // The tuple position is also the arm-vocabulary display order (rule-copy's ARM_LABELS derives it).
    "run_analysis",
    // D146-a — the CONTRIBUTOR bridge. The tuple stays CLOSED and gains ONE first-party member; the
    // open-world plugin tool name rides in its payload. This assertion is the guard on that clause: the day
    // someone adds a `plugin_*`-shaped or otherwise open member here, it fails, and it should.
    "run_tool",
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

// S1 — the per-choice consumption MODE. Without it the diegetic-chip
// authoring law has no lever: send-vs-compose was a per-chat GAME knob the `:::choices` fence reads, which a
// rule-surfaced chip has no access to. The DEFAULT is the arm's built semantic (`send` — a chip has always
// fired as the clicking member's message), so an existing stored rule keeps behaving exactly as it did.
test("surface_quick_reply choices carry a per-choice mode — explicit round-trips, absent defaults to send", () => {
  const parsed = automationActionSchema.parse({
    type: "surface_quick_reply",
    choices: [
      { label: "Flee", sendTemplate: "I run" },
      { label: "Plan", sendTemplate: "We should", mode: "compose" },
      { label: "Vote", sendTemplate: "I vote left", mode: "send" },
    ],
  });
  expect(parsed).toMatchObject({
    type: "surface_quick_reply",
    choices: [
      { label: "Flee", sendTemplate: "I run", mode: "send" },
      { label: "Plan", sendTemplate: "We should", mode: "compose" },
      { label: "Vote", sendTemplate: "I vote left", mode: "send" },
    ],
  });
  // The axis is CLOSED — an invented mode never reaches a member's surface.
  expect(automationActionSchema.safeParse({ type: "surface_quick_reply", choices: [{ label: "x", sendTemplate: "y", mode: "execute" }] }).success).toBe(false);
});

// #1368 — these four fields were the only bodied arm fields with no `.min(1)`, while their siblings
// (`run_analysis.brief`, `run_tool.name`) had one. An arm with no body is an unfinished configuration: a
// blank chip reaches the member's surface as an invisible button, a blank notification is delivered as an
// empty row, and a blank `transform_draft` template REPLACED the user's draft with an empty string.
test("an arm with a BLANK body is unrepresentable — the four fields that were missing `.min(1)`", () => {
  const blanks = [
    { type: "transform_draft", target: "user_input", template: "" },
    { type: "surface_quick_reply", choices: [{ label: "", sendTemplate: "go" }] },
    { type: "surface_quick_reply", choices: [{ label: "Go", sendTemplate: "" }] },
    { type: "post_notification", recipient: "host", messageTemplate: "" },
  ];
  for (const blank of blanks) {
    expect(automationActionSchema.safeParse(blank).success, `${JSON.stringify(blank)} must be refused`).toBe(false);
  }
  // …and the one-character versions of the same arms still parse (this narrows blanks, not bodies).
  expect(automationActionSchema.safeParse({ type: "transform_draft", target: "user_input", template: "x" }).success).toBe(true);
  expect(automationActionSchema.safeParse({ type: "surface_quick_reply", choices: [{ label: "G", sendTemplate: "g" }] }).success).toBe(true);
  expect(automationActionSchema.safeParse({ type: "post_notification", recipient: "host", messageTemplate: "x" }).success).toBe(true);
  expect(QUICK_REPLY_MODES).toEqual(["send", "compose"]);
});

// D146 (a) + the two axis decisions the arm makes, pinned so neither can drift silently.
test("run_tool carries the open-world name in its PAYLOAD, defaults argsTemplate/resultScope, and caps the name", () => {
  const bare = automationActionSchema.parse({ type: "run_tool", name: "plugin_mood_report" });
  expect(bare).toEqual({ type: "run_tool", name: "plugin_mood_report", argsTemplate: "{}", resultScope: "chat" });

  const full = automationActionSchema.parse({
    type: "run_tool",
    name: "plugin_mood_report",
    argsTemplate: '{"since":"{{lastMessage}}"}',
    resultVar: "mood",
    resultScope: "global",
  });
  expect(full).toMatchObject({ argsTemplate: '{"since":"{{lastMessage}}"}', resultVar: "mood", resultScope: "global" });

  // The NAME is capped but NOT charset-checked here on purpose — the registry is the authority and the mint
  // gate resolves against it. A cap breach is still refused so an oversized string can never be stored.
  expect(automationActionSchema.safeParse({ type: "run_tool", name: "" }).success).toBe(false);
  expect(automationActionSchema.safeParse({ type: "run_tool", name: "x".repeat(65) }).success).toBe(false);
  expect(automationActionSchema.safeParse({ type: "run_tool", name: "x".repeat(64) }).success).toBe(true);
  // The result plane is the SAME closed axis `set_variable.scope` uses — one spelling, no third plane.
  expect(automationActionSchema.safeParse({ type: "run_tool", name: "t", resultScope: "session" }).success).toBe(false);
});

// S5 (C1) — the run_analysis arm's authoring contract, pinned: routes default their apply postures, absence
// is the off switch, and the arm is deliberately NOT suggestible (consent is PER-ROUTE, never arm-level).
test("run_analysis parses with per-route apply defaults; an absent route stays absent", () => {
  const steerOnly = automationActionSchema.parse({
    type: "run_analysis",
    brief: "Maintain a secret arc and pace the scene.",
    routes: { steer: {} },
  });
  expect(steerOnly).toEqual({
    type: "run_analysis",
    brief: "Maintain a secret arc and pace the scene.",
    // steer applies DIRECT by default (RULED F7 — the pacing preset's posture).
    routes: { steer: { apply: "direct" } },
  });

  const full = automationActionSchema.parse({
    type: "run_analysis",
    brief: "b",
    steer: "slow burn",
    routes: {
      steer: { apply: "confirm" },
      lore: { bookId: "world_book_01h0000000000000000000000x" },
      suggest: {},
      vars: { key: "tension" },
    },
  });
  // lore defaults CONFIRM (a durable canon write earns a card); vars/suggest carry no apply knob at all.
  expect(full).toMatchObject({
    steer: "slow burn",
    routes: {
      steer: { apply: "confirm" },
      lore: { apply: "confirm", bookId: "world_book_01h0000000000000000000000x" },
      suggest: {},
      vars: { key: "tension" },
    },
  });

  // The apply axis is CLOSED.
  expect(automationActionSchema.safeParse({ type: "run_analysis", brief: "b", routes: { steer: { apply: "auto" } } }).success).toBe(false);
  // A brief is required — the pass IS its task.
  expect(automationActionSchema.safeParse({ type: "run_analysis", brief: "", routes: { steer: {} } }).success).toBe(false);
});

test("run_analysis is SPEND-classed and NOT suggestible (consent is per-route)", () => {
  expect(SPEND_ARM_TYPES).toContain("run_analysis");
  // `confirmFirst` is unspellable on this arm — the parse strips it, so `SuggestibleArmType` never widens.
  const parsed = automationActionSchema.parse({ type: "run_analysis", brief: "b", routes: { steer: {} }, confirmFirst: true });
  expect(parsed).not.toHaveProperty("confirmFirst");
  expect(isConfirmFirstArm(parsed)).toBe(false);
});

test("run_tool is SPEND-classed and deliberately NOT suggestible", () => {
  // Spend: the arm hands control to a contributor whose capabilities include a model call, so a rate refusal
  // must offer the F4 "run it now?" invitation — the money at stake is the rule author's.
  expect(SPEND_ARM_TYPES).toContain("run_tool");
  // Consent: `confirmFirst` is UNSPELLABLE on this arm, which is what keeps `SuggestibleArmType` (derived from
  // which arms carry the field) excluding it — a card that could only name the tool, not its effect, is a
  // click-through rather than consent. `.parse` strips the unknown key rather than storing a dead flag.
  const parsed = automationActionSchema.parse({ type: "run_tool", name: "plugin_x_y", confirmFirst: true });
  expect(parsed).not.toHaveProperty("confirmFirst");
  expect(isConfirmFirstArm(parsed)).toBe(false);
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

// ── TF-1: triggerFactSchema — the guest-marshalling contract ────────

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
    turn: { intent: "send", api: "", provider: "", model: "", speakerCharacterId: null, abortReason: "user_stop", automationDepth: 1 },
  };
  expect(triggerFactSchema.parse(turn)).toEqual(turn);

  // A minimal chat-scope fact (chatOpened) and a chat-less domain fact both parse.
  expect(triggerFactSchema.parse({ type: "chatOpened", bus: "chat", chatId: "chat_abc" }).chatId).toBe("chat_abc");
  // S7 — the character fact NESTS, and carries the source event's own `contentChanged` discriminator. It
  // was a flat `characterId` and the resolver dropped the flag, which made every domain-bus character rule
  // fire identically on a real card write and on a star toggle.
  const characterFact = triggerFactSchema.parse({ type: "character.updated", bus: "domain", chatId: null, character: { id: "char_9", contentChanged: true } });
  expect(characterFact.character).toEqual({ id: "char_9", contentChanged: true });
  // The flag is REQUIRED inside the object — a fact that reached the schema without it is malformed, not
  // "an edit we assume was content", because assuming it is what an edit-burst chore is made of.
  expect(triggerFactSchema.safeParse({ type: "character.updated", bus: "domain", chatId: null, character: { id: "char_9" } }).success).toBe(false);
  // S7's other two domain members carry their own owned row, id-only (the `assetId` shape).
  expect(triggerFactSchema.parse({ type: "persona.updated", bus: "domain", chatId: null, personaId: "persona_1" }).personaId).toBe("persona_1");
  expect(triggerFactSchema.parse({ type: "world-info.updated", bus: "domain", chatId: null, worldBookId: "book_1" }).worldBookId).toBe("book_1");
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
  expect(triggerFactSchema.safeParse({ type: "character.updated", bus: "chat", chatId: "c" }).success).toBe(false);
  expect(triggerFactSchema.safeParse({ type: "messageCommitted", bus: "domain", chatId: null }).success).toBe(false);
  expect(triggerFactSchema.safeParse({ type: "invented", bus: "chat", chatId: "c" }).success).toBe(false);
});

// #1433 — `triggerBusOf` is the ONE bus classification, and it reads TUPLE MEMBERSHIP. The watcher front
// door and `automationTriggerFor` both used to test `type.includes(".")`, which is a claim about today's
// NAMES rather than about the taxonomy: nothing makes every DomainEventType dot-namespaced or forbids a
// ChatBusEvent from carrying a dot, and the day either changed, an event would route through the wrong
// pre-check and the wrong rule loader while sitting correctly in the trigger map.
describe("triggerBusOf", () => {
  test("classifies EVERY member of both tuples by membership, and nothing else", () => {
    for (const type of CHAT_TRIGGER_TYPES) {
      expect(triggerBusOf(type)).toBe("chat");
    }
    for (const type of DOMAIN_TRIGGER_TYPES) {
      expect(triggerBusOf(type)).toBe("domain");
    }
  });

  test("answers NULL for an event on neither tuple — a bus member automation does not trigger on", () => {
    // A real ChatBusEvent that is not trigger vocabulary, a real DomainEvent mirror that is not either, and
    // an invented name: none of them can be a stored rule's trigger (the db CHECK derives from the tuples).
    expect(triggerBusOf("messagesReordered")).toBeNull();
    expect(triggerBusOf("crew.joined")).toBeNull();
    expect(triggerBusOf("invented")).toBeNull();
    // THE PLANTED CONTROL for the punctuation coincidence this classifier replaced: a dotted name that is
    // NOT domain trigger vocabulary answers null rather than "domain", which is exactly what the old
    // `includes(".")` test got wrong.
    expect(triggerBusOf("rpg.somethingNew")).toBeNull();
  });

  test("the two tuples are DISJOINT — membership order can never silently decide a shared member's bus", () => {
    const chat = new Set<string>(CHAT_TRIGGER_TYPES);
    const shared = DOMAIN_TRIGGER_TYPES.filter((type) => chat.has(type));
    expect(shared).toEqual([]);
  });

  test("automationTriggerFor derives its bus from the same classifier (one home for the pairing)", () => {
    for (const type of CHAT_TRIGGER_TYPES) {
      expect(automationTriggerFor(type)).toEqual({ bus: "chat", type });
    }
    for (const type of DOMAIN_TRIGGER_TYPES) {
      expect(automationTriggerFor(type)).toEqual({ bus: "domain", type });
    }
  });
});

// #1430 — the owner fire-rate belt has a CEILING. The constant is the one home; the domain verb holds the
// authoritative bound and the tRPC schema mirrors it.
test("the budget ceiling is a whole number above the owner plane default", () => {
  expect(Number.isInteger(AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR)).toBe(true);
  // A ceiling at or below the default would make the shipped default itself unsettable.
  expect(AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR).toBeGreaterThan(AUTOMATION_OWNER_BUDGET_DEFAULTS.maxFiresPerHour);
});
