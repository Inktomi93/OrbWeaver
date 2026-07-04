// `useStopTurn` — the composer's mid-stream STOP (scout §"composer" + UI-Arch §5 "lifecycle slices as
// DU transitions"). On click: `chatStream.markStopping(chatId)` fires FIRST — immediate feedback (the
// button reflects "stopping" before any network round-trip) and the store-level double-abort guard —
// THEN the `abort` verb fires. The slot does NOT close here: it closes only when the bus delivers the
// server's `turnAborted` (or a race-won `turnCompleted`) — read via `useTurnPhase`, never optimistic.
// `abort` (domain/chat/verbs/turn.ts `createAbort`) is idempotent server-side too (a no-in-flight abort
// is a no-op) — the store guard + the server guard are belt-and-suspenders, not redundant with each
// other (the store guard is what makes the SECOND CLICK feel instant-safe; the server guard is what
// makes a genuinely-raced double network call harmless).

import type { ChatId } from "@orb/kit/ids";
import { createEntityMutation, useTRPC } from "#data";
import type { TurnSlot } from "#state";
import { chatStream, useTurnPhase } from "#state";
import { useInvalidation } from "./use-invalidation";

interface AbortVars {
  readonly chatId: ChatId;
}

// Module-scope factory (§13.1 pattern). TData `unknown` — the abort's effect is bus-driven
// (`turnAborted` closes the slot); nothing here reads the mutation's own resolved value.
const useAbortMutation = createEntityMutation<AbortVars, unknown>({
  options: (trpc) => trpc.chat.abort.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listMessages.pathFilter(),
  ],
  errorToast: "Couldn't stop generation.",
});

export interface UseStopTurnResult {
  readonly phase: TurnSlot["phase"];
  /** `pending` or `streaming` — a live turn with nothing yet asking it to stop. */
  readonly canStop: boolean;
  readonly stop: () => void;
}

export function useStopTurn(chatId: ChatId | null): UseStopTurnResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const abort = useAbortMutation({ trpc, invalidation });
  const phase = useTurnPhase(chatId);
  const canStop = phase === "pending" || phase === "streaming";

  const stop = (): void => {
    if (chatId === null || !canStop) {
      return; // idempotent: idle / already-stopping / terminal — nothing to do
    }
    chatStream.markStopping(chatId);
    abort.mutate({ chatId });
  };

  return { phase, canStop, stop };
}
