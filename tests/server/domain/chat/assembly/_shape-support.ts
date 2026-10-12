import type { ChatInjection } from "@orb/contracts/chat";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { shape } from "#server/domain/chat/assembly/shape.ts";
import { convertsToEmptyWireRow } from "#server/domain/chat/substrate/wire-history.ts";

export { BEFORE_HISTORY_DEPTH } from "#server/domain/chat/assembly/injections.ts";
export { computeHistoryBreakpoint, shape, toShapeCanon } from "#server/domain/chat/assembly/shape.ts";
export type { DeliveredCue, HistoryMacroNames } from "#server/domain/chat/contract/results.ts";
export { buildWireHistory, convertsToEmptyWireRow } from "#server/domain/chat/substrate/wire-history.ts";

export const ARIA = castId<CharacterId>("character_aria");
export const KAI = castId<CharacterId>("character_kai");
/** The room's SYNTHETIC group card — a real `characters` row named "Group" that narrator turns are authored
 *  by (`__group__<chatId>`). It resolves through the identity producer like any member, which is exactly why
 *  every "is this a narrator row?" inference used to succeed at naming the wrong thing. */
export const GROUP_ID = castId<CharacterId>("character_group");
export const SPEAKERS = { user: "User", assistant: "Aria" };

// A clean 3-row solo canon (asst greeting, user, asst tip) — the prior tip is the last stable message.
export const SOLO_CANON = [
  { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
  { role: "user" as const, content: "u1", authorName: "User" },
  { role: "assistant" as const, content: "a1 tip", authorName: "Aria", characterId: ARIA },
];

export function soloInput(over: Partial<Parameters<typeof shape>[0]> = {}): Parameters<typeof shape>[0] {
  return {
    canon: SOLO_CANON,
    appendUserTurn: "u2 volatile",
    injections: [],
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    namesBehavior: "default",
    speakers: SPEAKERS,
    groupNudge: null,
    convertsToEmptyWireRow,
    ...over,
  };
}

export const inChat = (over: Partial<ChatInjection>): ChatInjection => ({
  position: "in_chat",
  depth: 0,
  role: "user",
  content: "x",
  ...over,
});

/** The delivered row the runner pins for SHAPE's depth — resolved with the runner's own depth counter. */
export function pinnedRow(out: ReturnType<typeof shape>): { role: string; content: string } | undefined {
  const index = rowIndexAtCacheDepth(out.history, out.cacheBreakpointFromEnd ?? -1);
  return index === undefined ? undefined : out.history[index];
}
