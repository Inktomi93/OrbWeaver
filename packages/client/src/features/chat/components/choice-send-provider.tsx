// P5 CYOA click→send — the Provider half (context + consumer: `../hooks/choice-send-context`). Owns its
// OWN `useSendMessage` instance (separate from the composer's — a choice click must never clear or race
// the composer draft) and derives `busy` from the shared turn phase, so every option button in the thread
// disables while a turn is in flight (§5.3). Mounted by the room surface around the message thread; a
// choice sends exactly like typed input (commit → turn), riding the same bus-driven machinery.

import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import type { ChatHandle } from "#state";
import { isCommitted, useTurnPhase } from "#state";
import type { ChoiceSend } from "../hooks/choice-send-context";
import { ChoiceSendContext } from "../hooks/choice-send-context";
import { useSendMessage } from "../hooks/use-send-message";

export interface ChoiceSendProviderProps {
  readonly handle: ChatHandle;
  readonly children: ReactNode;
}

/** Provides the thread's choice-send capability. Choices only exist on committed chats (an assistant
 *  emitted them), so a draft handle provides null (options render disabled until the room commits). */
export function ChoiceSendProvider({ handle, children }: ChoiceSendProviderProps): ReactElement {
  const chatId = isCommitted(handle) ? handle.id : null;
  const phase = useTurnPhase(chatId);
  const turnBusy = phase === "pending" || phase === "streaming" || phase === "stopping";
  const sender = useSendMessage({ handle });
  const send = sender.send;
  const busy = turnBusy || sender.isPending;
  const value = useMemo<ChoiceSend | null>(() => (chatId === null ? null : { send, busy }), [chatId, send, busy]);
  return <ChoiceSendContext value={value}>{children}</ChoiceSendContext>;
}
