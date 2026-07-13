// @orb/contracts/automation — the automation vocabulary, RIDER SLICE ONLY: the closed trigger taxonomy
// + fire-outcome tuple, promoted here so the `@orb/db` CHECKs can derive them. The rest of the module
// lands with `domain/automation` — do not grow this file ahead of that build.
// The trigger id IS the source event discriminator — no third event vocabulary. Reserved members are
// typed-but-refused at `createRule` until wired.

import { z } from "zod";

/** `ChatBusEvent` discriminators automation may trigger on — a subset of the frozen chat-bus union.
 *  The tail after `chatCreated` is reserved (criterion: first real rule request). */
export const CHAT_TRIGGER_TYPES = [
  // v1 (wired)
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
  // reserved (typed, not wired v1)
  "messageHidden",
  "messagesDeleted",
  "chatUpdated",
  "wiEntryAttached",
  "wiEntryDetached",
] as const;
export type ChatTriggerType = (typeof CHAT_TRIGGER_TYPES)[number];

/** `DomainEvent` types automation may trigger on. The crew/rpg members are reserved — they enter
 *  service when their domains land their domain-event mirrors. */
export const DOMAIN_TRIGGER_TYPES = [
  // v1 (wired)
  "character.updated",
  "asset.created",
  // reserved: chat-crew
  "crew.keeperRan",
  "crew.editProposalCreated",
  "crew.cardProposalCreated",
  "crew.directorPassCompleted",
  // reserved: rpg
  "rpg.clockCompleted",
  "rpg.sessionConcluded",
  "rpg.encounterEnded",
  "rpg.reputationMilestone",
  "rpg.checkResolved",
] as const;
export type DomainTriggerType = (typeof DOMAIN_TRIGGER_TYPES)[number];

/** A rule's trigger: `{bus, type}` where `type` is a member of that bus's source union — no third
 *  vocabulary. The db pairs the two columns with a bus↔tuple CHECK derived from the same tuples. */
export const automationTriggerSchema = z.discriminatedUnion("bus", [
  z.object({ bus: z.literal("chat"), type: z.enum(CHAT_TRIGGER_TYPES) }),
  z.object({ bus: z.literal("domain"), type: z.enum(DOMAIN_TRIGGER_TYPES) }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

/** The two source buses — tied to the trigger union's discriminant. */
export const AUTOMATION_TRIGGER_BUSES = [
  "chat",
  "domain",
] as const satisfies readonly AutomationTrigger["bus"][];
export type AutomationTriggerBus = (typeof AUTOMATION_TRIGGER_BUSES)[number];

/** Every terminal a dispatch can record for a rule×event: the fire log is the per-hour budget source
 *  + the host's "why didn't my rule fire" answer + testRun provenance. */
export const AUTOMATION_FIRE_OUTCOMES = [
  "fired",
  "predicate_false",
  "predicate_error",
  "budget_refused",
  "depth_refused",
  "action_error",
  "authority_refused",
  "test_run",
] as const;
export type AutomationFireOutcome = (typeof AUTOMATION_FIRE_OUTCOMES)[number];
export const automationFireOutcomeSchema = z.enum(AUTOMATION_FIRE_OUTCOMES);
