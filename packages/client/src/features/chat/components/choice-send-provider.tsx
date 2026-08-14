// P5 CYOA click→choose — the Provider half (context + consumer: `../hooks/choice-send-context`). Owns its
// OWN `useSendMessage` instance (separate from the composer's — a choice click in `send` mode must never
// clear or race the composer draft) and derives `busy` from the shared turn phase, so every option button
// in the thread disables while a turn is in flight (§5.3). Mounted by the room surface around the message
// thread.
//
// The `choose` behavior is gated by the game's `cyoaChoiceBehavior` knob (§5.4), read cache-first off
// `rpg.getGame.publicConfig` (the composer-wand's exact key — lockdown §12 direct cross-feature tRPC read):
// `send` fires the option as the user turn immediately; `compose` (the default, and the fallback for a
// non-game chat / an unsettled query) drops the option into the composer DRAFT for this room's scope +
// requests composer focus, so the reader appends flavor before sending.

import { isRpgEngaged } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useGatedQuery, useTRPC } from "#data";
import { requestComposerFocus, setComposerDraft, useTurnPhase } from "#state";
import type { ChoiceSend } from "../hooks/choice-send-context.tsx";
import { ChoiceSendContext } from "../hooks/choice-send-context.tsx";
import { useSendMessage } from "../hooks/use-send-message.ts";

export interface ChoiceSendProviderProps {
  readonly chatId: ChatId;
  readonly children: ReactNode;
}

/** Provides the thread's choice capability, branching on the game's `cyoaChoiceBehavior` knob. */
export function ChoiceSendProvider({ chatId, children }: ChoiceSendProviderProps): ReactElement {
  const trpc = useTRPC();
  const phase = useTurnPhase(chatId);
  const turnBusy = phase === "pending" || phase === "streaming" || phase === "stopping";
  const sender = useSendMessage({ chatId });
  const send = sender.send;
  const busy = turnBusy || sender.isPending;
  // The game knob — cache-first, only when this room is a LIVE game (the composer-wand's exact gate: the
  // getChat rpg pointer, cache-first, through the ONE `isRpgEngaged` predicate). Gating on `chatId` alone
  // fired `rpg.getGame` on EVERY committed chat and 404-retry-looped on non-game rooms (owner-hit). Absent /
  // unsettled / non-game ⇒ the "compose" default (a lower-commitment interaction; the intended fallback).
  const detailQuery = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const isGame = isRpgEngaged(detailQuery.data?.rpg ?? null);
  const gameQuery = useGatedQuery(isGame ? chatId : null, (id) => trpc.rpg.getGame.queryOptions({ chatId: id }));
  const behavior = gameQuery.data?.publicConfig.cyoaChoiceBehavior ?? "compose";

  const choose = (text: string): void => {
    if (behavior === "send") {
      send(text);
      return;
    }
    // compose: seed the composer draft for this room's scope (the room's id) + focus it.
    setComposerDraft(chatId, text);
    requestComposerFocus(chatId);
  };
  const value: ChoiceSend = { choose, busy };
  return <ChoiceSendContext value={value}>{children}</ChoiceSendContext>;
}
