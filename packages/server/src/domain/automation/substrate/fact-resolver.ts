// domain/automation/substrate/fact-resolver — the taxonomy filter + `TriggerFact` builder (01 §2). CEL never
// reads raw bus payloads: before predicate evaluation the watcher resolves an event into a typed fact by
// re-reading canon through the injected chat ops (the D38 discipline). The resolve happens ONCE per event
// (shared across every matching rule of that chat). It ALSO computes the event's cascade DEPTH (03 §4) — read
// off the committed reply slot through `getTurnOrigin` — which the dispatch depth gate + child-write origin
// consume (the fact carries it only for turn events; message/other events surface it here).
//
// `FACT_SHAPE` is the taxonomy filter: a mapped-type `Record` over BOTH trigger tuples (exhaustive-dispatch —
// a new tuple member without a shape entry fails tsc). A non-taxonomy event (delta/warning/…) is not a key ⇒
// `resolveTrigger` returns null (skip).

import type { ChatTriggerType, DomainTriggerType, TriggerFact } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { ChatId, MessageId } from "@orb/kit/ids";
import type { AutomationOps, ResolvedTrigger } from "../contract/ops";

/** How each trigger's fact is shaped (01 §2 table). A homed tuple → derived union (no re-spelled literals). */
const FACT_SHAPES = ["chatScope", "message", "turn", "worldInfo", "persona", "characterId", "assetId"] as const;
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
  chatUpdated: "chatScope",
  wiEntryAttached: "chatScope",
  wiEntryDetached: "chatScope",
  // domain bus
  "character.updated": "characterId",
  "asset.created": "assetId",
} as const satisfies Record<ChatTriggerType | DomainTriggerType, FactShape>;

type TriggerType = keyof typeof FACT_SHAPE;
type BusEvent = ChatBusEvent | DomainEvent;

/** A DomainEvent (character.updated/asset.created + the crew/rpg mirrors) rides the domain bus — its type is
 *  namespaced with a dot; every ChatBusEvent is a bare discriminant. */
function busOf(event: BusEvent): TriggerFact["bus"] {
  return event.type.includes(".") ? "domain" : "chat";
}

/** The event's `chatId` when it has one (every ChatBusEvent + the crew/rpg domain mirrors), else null. */
function eventChatId(event: BusEvent): ChatId | null {
  return "chatId" in event ? event.chatId : null;
}

/** Read the cascade depth off a committed reply slot (03 §4) — 0 when the slot is human-plane / absent. */
async function depthOf(ops: AutomationOps, chatId: ChatId | null, messageId: MessageId | null): Promise<number> {
  if (chatId === null || messageId === null) {
    return 0;
  }
  const origin = await ops.chat.getTurnOrigin(chatId, messageId);
  return origin?.automationDepth ?? 0;
}

/** The scalar fact skeleton every branch extends. */
function baseFact(event: BusEvent): Pick<TriggerFact, "type" | "bus" | "chatId"> {
  return { type: event.type, bus: busOf(event), chatId: eventChatId(event) };
}

async function resolveMessage(ops: AutomationOps, event: BusEvent): Promise<ResolvedTrigger> {
  const chatId = eventChatId(event);
  if (chatId === null || !("messageId" in event) || event.messageId === null) {
    return { fact: baseFact(event), automationDepth: 0 };
  }
  const [message, automationDepth] = await Promise.all([ops.chat.getMessageFact(chatId, event.messageId), depthOf(ops, chatId, event.messageId)]);
  return { fact: { ...baseFact(event), ...(message !== null ? { message } : {}) }, automationDepth };
}

async function resolveTurn(ops: AutomationOps, event: BusEvent): Promise<ResolvedTrigger> {
  const base = baseFact(event);
  const chatId = eventChatId(event);
  if (event.type === "turnStarted") {
    const automationDepth = await depthOf(ops, chatId, event.targetMessageId);
    const turn = {
      intent: event.intent,
      api: event.api,
      source: event.source,
      model: event.model,
      speakerCharacterId: event.speakerCharacterId,
      automationDepth,
    };
    return { fact: { ...base, turn }, automationDepth };
  }
  if (event.type === "turnCompleted") {
    const automationDepth = await depthOf(ops, chatId, event.messageId);
    return { fact: { ...base, turn: { intent: event.intent, api: "", source: "", model: "", speakerCharacterId: null, automationDepth } }, automationDepth };
  }
  if (event.type === "turnAborted") {
    // An aborted turn commits NO reply slot, so depth can't be read via `getTurnOrigin` (the sibling paths' way).
    // It rides the event instead (chat's engine threads the aborting turn's own depth) — so a depth ≥ 1 abort
    // (an automation turn that failed) yields a depth ≥ 1 fact, and `runGates` suppresses non-opted `turnAborted`
    // rules. Hardcoding 0 here let a depth-0 "retry on failure" rule self-loop (03 §4's default-no-retrigger hole).
    const automationDepth = event.automationDepth;
    const turn = { intent: event.intent, api: "", source: "", model: "", speakerCharacterId: null, abortReason: event.reason, automationDepth };
    return { fact: { ...base, turn }, automationDepth };
  }
  return { fact: base, automationDepth: 0 };
}

function resolveScalar(event: BusEvent): ResolvedTrigger {
  const base = baseFact(event);
  if (event.type === "worldInfoActivated") {
    return { fact: { ...base, worldInfo: { entryIds: event.entryIds } }, automationDepth: 0 };
  }
  if (event.type === "personaSwitched") {
    return { fact: { ...base, persona: { from: event.from, to: event.to } }, automationDepth: 0 };
  }
  if (event.type === "character.updated") {
    return { fact: { ...base, characterId: event.characterId }, automationDepth: 0 };
  }
  if (event.type === "asset.created") {
    return { fact: { ...base, assetId: event.assetId }, automationDepth: 0 };
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
