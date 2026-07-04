// @orb/contracts/automation — the D46 automation vocabulary, RIDER SLICE ONLY: the closed trigger
// taxonomy (automation-design/01 §1) + the fire-outcome tuple, promoted here so the `@orb/db`
// `automation_rules`/`automation_fires` CHECKs can DERIVE them (the D34 pattern — db deps are
// kit + contracts only; a domain-contract home would strand the column at bare `text()`). The REST of
// the module (the action union, `TriggerFact`, `AutomationCelEnv`, `AutomationOrigin`, the bus union,
// `LIVE_TRIGGERS`) lands with `domain/automation` (Phase 8) — do not grow this file ahead of that build.
//
// The trigger id IS the source event discriminator — automation invents no third event vocabulary
// (01 §0). Reserved members are typed-but-refused at `createRule` until wired (the D37 born-whole
// posture: the vocabulary is complete from birth, the handlers land later).

import { z } from "zod";

/** `ChatBusEvent` discriminators automation may trigger on — a SUBSET of the frozen chat-bus union
 *  (automation-design/01 §1). v1 members wire at ship; the tail after `chatCreated` is reserved
 *  (criterion: first real rule request). The `automation_rules.trigger_type` CHECK derives this tuple. */
export const CHAT_TRIGGER_TYPES = [
  // ── v1 (wired) ──
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
  // ── reserved (typed, not wired v1) ──
  "messageHidden",
  "messagesDeleted",
  "chatUpdated",
  "wiEntryAttached",
  "wiEntryDetached",
] as const;
export type ChatTriggerType = (typeof CHAT_TRIGGER_TYPES)[number];

/** `DomainEvent` types automation may trigger on (automation-design/01 §1). The crew/rpg members are
 *  RESERVED — they enter service when D59/D58 land their domain-event mirrors; listed from birth so the
 *  design sets reconcile against ONE tuple. */
export const DOMAIN_TRIGGER_TYPES = [
  // ── v1 (wired) ──
  "character.updated",
  "asset.created",
  // ── reserved: chat-crew (D59) ──
  "crew.keeperRan",
  "crew.editProposalCreated",
  "crew.cardProposalCreated",
  "crew.directorPassCompleted",
  // ── reserved: rpg (D58) ──
  "rpg.clockCompleted",
  "rpg.sessionConcluded",
  "rpg.encounterEnded",
  "rpg.reputationMilestone",
  "rpg.checkResolved",
] as const;
export type DomainTriggerType = (typeof DOMAIN_TRIGGER_TYPES)[number];

/** A rule's trigger: `{bus, type}` where `type` is a member of that bus's source union (01 §0 — no
 *  third vocabulary). The db pairs the two columns with a bus↔tuple CHECK derived from the same
 *  tuples. */
export const automationTriggerSchema = z.discriminatedUnion("bus", [
  z.object({ bus: z.literal("chat"), type: z.enum(CHAT_TRIGGER_TYPES) }),
  z.object({ bus: z.literal("domain"), type: z.enum(DOMAIN_TRIGGER_TYPES) }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

/** The two source buses — tied to the trigger union's discriminant (`satisfies`; the
 *  `automation_rules.trigger_bus` CHECK derives this tuple). */
export const AUTOMATION_TRIGGER_BUSES = [
  "chat",
  "domain",
] as const satisfies readonly AutomationTrigger["bus"][];
export type AutomationTriggerBus = (typeof AUTOMATION_TRIGGER_BUSES)[number];

/** Every terminal a dispatch can record for a rule×event (automation-design/04 §1/§3): the fire log is
 *  the per-hour budget source + the host's "why didn't my rule fire" answer + testRun provenance. The
 *  `automation_fires.outcome` CHECK derives this tuple. */
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
