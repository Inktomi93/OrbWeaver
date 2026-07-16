// Contract tests for @orb/contracts/automation (D46 rider slice): the two trigger tuples the
// `automation_rules` paired CHECK derives (membership pinned — v1 + reserved, per 01 §1), the
// bus-discriminated trigger schema (a cross-bus trigger name fails to parse), and the fire-outcome
// tuple the `automation_fires` CHECK derives.

import type { ChatTriggerType, DomainTriggerType } from "@orb/contracts/automation";
import {
  AUTOMATION_FIRE_OUTCOMES,
  AUTOMATION_TRIGGER_BUSES,
  automationFireOutcomeSchema,
  automationTriggerSchema,
  CHAT_TRIGGER_TYPES,
  DOMAIN_TRIGGER_TYPES,
} from "@orb/contracts/automation";
import { expect, test } from "../../support/fixtures";

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

test("DOMAIN_TRIGGER_TYPES is the pinned 11-member domain-bus subset (v1 + crew/rpg reserved)", () => {
  expect(DOMAIN_TRIGGER_TYPES).toEqual([
    "character.updated",
    "asset.created",
    "crew.keeperRan",
    "crew.editProposalCreated",
    "crew.cardProposalCreated",
    "crew.directorPassCompleted",
    "rpg.clockCompleted",
    "rpg.sessionConcluded",
    "rpg.encounterEnded",
    "rpg.reputationMilestone",
    "rpg.checkResolved",
  ]);
});

test("automationTriggerSchema discriminates on bus and refuses a cross-bus trigger name", () => {
  expect(automationTriggerSchema.parse({ bus: "chat", type: "chatOpened" })).toEqual({
    bus: "chat",
    type: "chatOpened",
  });
  expect(automationTriggerSchema.parse({ bus: "domain", type: "crew.keeperRan" })).toEqual({
    bus: "domain",
    type: "crew.keeperRan",
  });
  // The chat bus does not admit domain trigger names (and vice versa) — the db CHECK mirrors this.
  expect(automationTriggerSchema.safeParse({ bus: "chat", type: "character.updated" }).success).toBe(false);
  expect(automationTriggerSchema.safeParse({ bus: "domain", type: "messageCommitted" }).success).toBe(false);
  expect(automationTriggerSchema.safeParse({ bus: "plugin", type: "chatOpened" }).success).toBe(false);
});

test("AUTOMATION_TRIGGER_BUSES mirrors the trigger union's discriminant set", () => {
  expect(AUTOMATION_TRIGGER_BUSES).toEqual(["chat", "domain"]);
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
  "crew.keeperRan": true,
  "crew.editProposalCreated": true,
  "crew.cardProposalCreated": true,
  "crew.directorPassCompleted": true,
  "rpg.clockCompleted": true,
  "rpg.sessionConcluded": true,
  "rpg.encounterEnded": true,
  "rpg.reputationMilestone": true,
  "rpg.checkResolved": true,
};

test("the trigger unions have no member beyond their tuples", () => {
  expect(Object.keys(CHAT_SEEN).sort()).toEqual([...CHAT_TRIGGER_TYPES].sort());
  expect(Object.keys(DOMAIN_SEEN).sort()).toEqual([...DOMAIN_TRIGGER_TYPES].sort());
});
