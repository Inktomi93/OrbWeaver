// Automation owns the chat/author scope vocabulary; ordering is the canonical kit engine.

import type { ChatId, UserId } from "@orb/kit/ids";

/**
 * THE AUTOMATION SCOPE KEYS — one lane per chat, one per OWNER on the domain bus (#1554 — the domain bus
 * used to be ONE lane, full stop; the header below states why per-owner is the improvement and per-subject
 * is not), and this pair is their ONE home.
 *
 * Every entry into the dispatch engine derives its key here rather than spelling the string: the bus door
 * (`substrate/handle-event.ts`), the host's "Run now" and the S4 invitation confirm (`substrate/run-now.ts`),
 * and the stashed-arm confirm (`verbs/confirm-suggestion.ts`). A re-spelling is how two of those four end up
 * on lanes that only LOOK like the same lane — which is exactly the shape of the defect they exist to close
 * (a host's Run-now read-modify-writing the chat variable plane beside a bus fire).
 *
 * TWO FUNCTIONS, never one taking `chatId: ChatId | null` — a chat dispatch's lane never depends on WHICH
 * rule's owner is contending (many owners' rules can share one chat's variable plane, correctly serialized
 * together), so a single signature would force every chat-lane call site to thread an owner id it does not
 * use. Each caller already knows, from its own `chatId === null` branch, which one it means.
 */
export function automationChatLaneKey(chatId: ChatId): string {
  return `automation:chat:${chatId}`;
}

/** The owner-GLOBAL (chat-less) lane, keyed by OWNER — never the whole bus (the old single-lane shape) and
 *  never the event's SUBJECT id (`characterId`/`assetId`/…): `handle-event.ts` carries the argument that
 *  rules contend over their AUTHOR's own variable plane, which a subject id does not name and would look
 *  like scope while buying nothing. */
export function automationDomainLaneKey(ownerId: UserId): string {
  return `automation:domain:${ownerId}`;
}
