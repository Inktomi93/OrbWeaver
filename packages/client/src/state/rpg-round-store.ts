// Live RPG state-round lifecycles, keyed by chat + turn. Narrative streaming can finish seconds before the
// post-commit model/tool round writes its snapshot; this store keeps the panel's freshness indicator pending
// across that gap. Transient by design: reconnect gap-heal refetches durable state, and a dead socket cannot
// truthfully know whether an old round is still live.

import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

interface RpgRoundState {
  readonly pendingByChat: Readonly<Record<string, readonly ChatTurnId[]>>;
}

const useRpgRoundStore = createGatedStore<RpgRoundState>("rpg-round", (): RpgRoundState => ({ pendingByChat: {} }));

function writePending(chatId: ChatId, next: readonly ChatTurnId[], action: string): void {
  const pendingByChat = { ...useRpgRoundStore.getState().pendingByChat };
  if (next.length === 0) {
    delete pendingByChat[chatId];
  } else {
    pendingByChat[chatId] = next;
  }
  useRpgRoundStore.setState({ pendingByChat }, true, action);
}

/** Apply only the two lifecycle members; durable members leave this transient set untouched. */
export function applyRpgRoundEvent(event: RpgBusEvent): void {
  if (event.type === "stateRoundStarted") {
    const current = useRpgRoundStore.getState().pendingByChat[event.chatId] ?? [];
    if (!current.includes(event.turnId)) {
      writePending(event.chatId, [...current, event.turnId], "rpgRound/start");
    }
    return;
  }
  if (event.type === "stateRoundSettled") {
    const current = useRpgRoundStore.getState().pendingByChat[event.chatId] ?? [];
    writePending(
      event.chatId,
      current.filter((turnId) => turnId !== event.turnId),
      "rpgRound/settle",
    );
  }
}

export function useRpgRoundPending(chatId: ChatId): boolean {
  return useRpgRoundStore((state) => (state.pendingByChat[chatId]?.length ?? 0) > 0);
}

export function readRpgRoundPendingForTest(chatId: ChatId): boolean {
  return (useRpgRoundStore.getState().pendingByChat[chatId]?.length ?? 0) > 0;
}

/** Test/reset seam; a reconnect starts from durable query truth, not stale lifecycle memory. */
export function clearRpgRounds(chatId?: ChatId): void {
  if (chatId === undefined) {
    useRpgRoundStore.setState({ pendingByChat: {} }, true, "rpgRound/clear-all");
    return;
  }
  writePending(chatId, [], "rpgRound/clear");
}
