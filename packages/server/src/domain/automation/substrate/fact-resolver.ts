// domain/automation/substrate/fact-resolver — the taxonomy filter + `TriggerFact` builder. CEL never
// reads raw bus payloads: before predicate evaluation the watcher resolves an event into a typed fact by
// re-reading canon through the injected chat ops (the D38 discipline). The resolve happens ONCE per event
// (shared across every matching rule of that chat). It ALSO computes the event's cascade DEPTH — usually read
// off the committed reply slot through `getTurnOrigin` — which the dispatch depth gate + child-write origin
// consume. Two events have NO committed slot to read back from and carry the depth ON THE EVENT instead:
// `turnAborted` (the abort commits nothing) and `worldInfoActivated` (raised mid-assembly, before the reply
// commits) — both are the generating turn's own depth, threaded by chat's engine.
//
// THE DEPTH IS FAIL-CLOSED, not defaulted. A `message`/`turn` event whose slot has been deleted by the time
// this asynchronous resolve runs resolves to `null` (skip) rather than to a depth-0 fact: 0 is not "unknown",
// it is the claim that a human did this, and both consumers of the number — the rule cascade gate and the
// plugin fan-out's opt-in gate — would then hand an automation-authored event to subscribers that opted OUT.
// `resolveMessage` carries the full argument.
//
// `FACT_SHAPE` is the taxonomy filter: a mapped-type `Record` over BOTH trigger tuples (exhaustive-dispatch —
// a new tuple member without a shape entry fails tsc). A non-taxonomy event (delta/warning/…) is not a key ⇒
// `resolveTrigger` returns null (skip).

import type { AutomationTrigger, ChatTriggerType, DomainTriggerType, TriggerFact } from "@orb/contracts/automation";
import { automationTriggerFor } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { ChatId, MessageId } from "@orb/kit/ids";
import type { AutomationOps, ResolvedTrigger } from "../contract/ops.ts";

/** How each trigger's fact is shaped (the table below). A homed tuple → derived union (no re-spelled literals). */
const FACT_SHAPES = ["chatScope", "message", "turn", "worldInfo", "persona", "reaction", "character", "assetId", "personaId", "worldBookId"] as const;
type FactShape = (typeof FACT_SHAPES)[number];

const FACT_SHAPE = {
  // chat bus
  chatOpened: "chatScope",
  chatCreated: "chatScope",
  messageCommitted: "message",
  messageEdited: "message",
  variantSelected: "message",
  messageHidden: "message",
  messagesDeleted: "chatScope",
  turnStarted: "turn",
  turnCompleted: "turn",
  turnAborted: "turn",
  worldInfoActivated: "worldInfo",
  personaSwitched: "persona",
  // B6/MR0. NOT the `message` shape, deliberately: that shape re-reads canon for the reacted-to slot, and the
  // reaction's own facts (which emoji, added or removed) live on the event and are the only things a
  // reaction rule can actually select on. A rule that also wants the reacted-to PROSE has `message.id` here
  // to reach it with — a widening, not a today-cost on every toggle.
  reactionsChanged: "reaction",
  chatUpdated: "chatScope",
  wiEntryAttached: "chatScope",
  wiEntryDetached: "chatScope",
  // domain bus
  "character.updated": "character",
  "asset.created": "assetId",
  "persona.updated": "personaId",
  "world-info.updated": "worldBookId",
} as const satisfies Record<ChatTriggerType | DomainTriggerType, FactShape>;

type TriggerType = keyof typeof FACT_SHAPE;
type BusEvent = ChatBusEvent | DomainEvent;

/** The event's `chatId` when it has one (every ChatBusEvent + the agents/rpg domain mirrors), else null. */
function eventChatId(event: BusEvent): ChatId | null {
  return "chatId" in event ? event.chatId : null;
}

/** Read the cascade depth off a committed reply slot. `0` when the event names NO slot (nothing generated it —
 *  the human plane); `null` when it names one that no longer exists, which is UNKNOWN and never 0: chat's
 *  `loadTurnOrigin` returns null only for a vanished (or foreign-chat) row, and the stamped depth of a live
 *  human slot is a real 0 read off the row. Callers fail closed on `null` — see {@link resolveMessage}. */
async function depthOf(ops: AutomationOps, chatId: ChatId | null, messageId: MessageId | null): Promise<number | null> {
  if (chatId === null || messageId === null) {
    return 0;
  }
  const origin = await ops.chat.getTurnOrigin(chatId, messageId);
  return origin === null ? null : origin.automationDepth;
}

/** The scalar fact skeleton every branch extends. */
function baseFact(event: BusEvent): AutomationTrigger & Pick<TriggerFact, "chatId"> {
  return { ...automationTriggerFor(event.type as TriggerType), chatId: eventChatId(event) };
}

/** A message-shaped event whose slot is NAMED but no longer readable — the canon row was deleted between the
 *  emit and this (asynchronous) resolve. It resolves to `null`: the event is SKIPPED, exactly like a
 *  non-taxonomy one.
 *
 *  FAIL CLOSED, because the alternative is a depth LIE. The cascade belt is a NUMBER: `runGates` suppresses a
 *  depth ≥ 1 event for a rule that did not opt into automation events, and the plugin fan-out's cheap gate
 *  reads the same field. Depth is read off the slot's own `getTurnOrigin`, so a vanished slot yields `0` — and
 *  `0` is not "unknown", it is the affirmative claim THIS EVENT CAME FROM A HUMAN. An automation-authored
 *  message that a rule deletes as it works (a summarize-then-prune rule is the shipped case) therefore
 *  re-entered every rule and every plugin subscriber that had explicitly opted OUT of automation events.
 *  There is no third answer available here: the row that carried the depth is gone, so the honest resolution
 *  is no fact at all. The cost is a dropped trigger for a message nobody can read any more. */
async function resolveMessage(ops: AutomationOps, event: BusEvent): Promise<ResolvedTrigger | null> {
  const chatId = eventChatId(event);
  if (chatId === null || !("messageId" in event) || event.messageId === null) {
    // NOT the raced-away case: the event names no slot at all, so there is no origin to have lost. These are
    // the message-shaped members that legitimately carry no id, and their human-plane depth 0 is a fact.
    return { fact: baseFact(event), automationDepth: 0 };
  }
  const [message, automationDepth] = await Promise.all([ops.chat.getMessageFact(chatId, event.messageId), depthOf(ops, chatId, event.messageId)]);
  if (message === null || automationDepth === null) {
    return null;
  }
  return { fact: { ...baseFact(event), message }, automationDepth };
}

/** The `turn` shape's twin of {@link resolveMessage}'s fail-closed arm, and the same ruling: the two members
 *  that READ their depth off a slot (`turnStarted`'s target, `turnCompleted`'s reply) resolve to `null` when
 *  that slot is gone, because an unknown depth presented as 0 is the affirmative claim that a human started
 *  this. The two that CARRY their depth on the event (`turnAborted`, `worldInfoActivated`) can never be
 *  unknown and are untouched. */
async function resolveTurn(ops: AutomationOps, event: BusEvent): Promise<ResolvedTrigger | null> {
  const base = baseFact(event);
  const chatId = eventChatId(event);
  if (event.type === "turnStarted") {
    const automationDepth = await depthOf(ops, chatId, event.targetMessageId);
    if (automationDepth === null) {
      return null;
    }
    const turn = {
      intent: event.intent,
      // `api` is `null` on a non-chat kind at the contract; the fact vocabulary is strings, so absent reads "".
      api: event.api ?? "",
      provider: event.provider,
      model: event.model,
      speakerCharacterId: event.speakerCharacterId,
      automationDepth,
    };
    return { fact: { ...base, turn }, automationDepth };
  }
  if (event.type === "turnCompleted") {
    const automationDepth = await depthOf(ops, chatId, event.messageId);
    if (automationDepth === null) {
      return null;
    }
    return { fact: { ...base, turn: { intent: event.intent, api: "", provider: "", model: "", speakerCharacterId: null, automationDepth } }, automationDepth };
  }
  if (event.type === "turnAborted") {
    // An aborted turn commits NO reply slot, so depth can't be read via `getTurnOrigin` (the sibling paths' way).
    // It rides the event instead (chat's engine threads the aborting turn's own depth) — so a depth ≥ 1 abort
    // (an automation turn that failed) yields a depth ≥ 1 fact, and `runGates` suppresses non-opted `turnAborted`
    // rules. Hardcoding 0 here let a depth-0 "retry on failure" rule self-loop (the default-no-retrigger hole).
    const automationDepth = event.automationDepth;
    const turn = { intent: event.intent, api: "", provider: "", model: "", speakerCharacterId: null, abortReason: event.reason, automationDepth };
    return { fact: { ...base, turn }, automationDepth };
  }
  return { fact: base, automationDepth: 0 };
}

function resolveScalar(event: BusEvent): ResolvedTrigger {
  const base = baseFact(event);
  if (event.type === "worldInfoActivated") {
    // The activation is raised DURING the generating turn's assembly, BEFORE its reply slot commits — so its
    // depth cannot be read via `getTurnOrigin` (the sibling paths' way; there is no message yet). It rides the
    // event instead (chat's engine threads the generating turn's own depth — the `turnAborted` mechanism). A
    // depth ≥ 1 activation (raised by an automation reaction turn) yields a depth ≥ 1 fact, so the cascade guard
    // bounds a turn-generating rule on this trigger. Hardcoding 0 let a reactToLoreActivation rule self-chain,
    // escalating no depth (leaning entirely on a per-preset `cooldownSeconds` belt).
    return { fact: { ...base, worldInfo: { entryIds: event.entryIds } }, automationDepth: event.automationDepth };
  }
  if (event.type === "personaSwitched") {
    return { fact: { ...base, persona: { from: event.from, to: event.to } }, automationDepth: 0 };
  }
  if (event.type === "reactionsChanged") {
    // Depth 0: a reaction is a HUMAN's concurrent act with no turn behind it (class-2-concurrent), so there
    // is no generating turn whose cascade depth it could inherit. A turn a reaction rule fires is depth 1
    // through the normal `requestTurn` stamp, exactly like a `chatOpened` rule's.
    const reaction = { messageId: event.messageId, variantId: event.variantId, emoji: event.emoji, added: event.added };
    return { fact: { ...base, reaction }, automationDepth: 0 };
  }
  if (event.type === "character.updated") {
    // `contentChanged` is CARRIED, not dropped (S7). The source event has always discriminated a real card
    // write from an identity-FLAG edit (star/archive/theme — `@orb/contracts/events`'s own note), and the
    // resolver used to project only the id, which made every domain-bus character rule fire on a star toggle.
    // A library rule that reacts to CONTENT — the living-library preset is the catalogue's case — degenerates
    // into an edit-burst chore without it.
    return { fact: { ...base, character: { id: event.characterId, contentChanged: event.contentChanged } }, automationDepth: 0 };
  }
  if (event.type === "asset.created") {
    return { fact: { ...base, assetId: event.assetId }, automationDepth: 0 };
  }
  if (event.type === "persona.updated") {
    return { fact: { ...base, personaId: event.personaId }, automationDepth: 0 };
  }
  if (event.type === "world-info.updated") {
    return { fact: { ...base, worldBookId: event.bookId }, automationDepth: 0 };
  }
  return { fact: base, automationDepth: 0 };
}

/** Resolve a bus event into `{ fact, automationDepth }`, or `null` for a non-taxonomy event (skip). */
export function resolveTrigger(ops: AutomationOps, event: BusEvent): Promise<ResolvedTrigger | null> {
  const shape = FACT_SHAPE[event.type as TriggerType] as FactShape | undefined;
  if (shape === undefined) {
    return Promise.resolve(null);
  }
  if (shape === "message") {
    return resolveMessage(ops, event);
  }
  if (shape === "turn") {
    return resolveTurn(ops, event);
  }
  return Promise.resolve(resolveScalar(event));
}
