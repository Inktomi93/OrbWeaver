// `useContinueTurn` — the composer's continue-on-empty action (PD-146): with the pref on, an empty Send
// on an assistant-tailed transcript extends that reply via the built `chat.continueTurn` verb (the same
// verb the guided wand's fireContinue drives), instead of the historical no-op. Bus-driven like every
// other turn mutation — the continue streams into the ghost and settles through the canon invalidation.

import type { ChatId, MessageId } from "@orb/kit/ids";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";

interface ContinueTurnVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

const useContinueTurnMutation = createEntityMutation<ContinueTurnVars, unknown>({
  options: (trpc) => trpc.chat.continueTurn.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't continue the reply.",
});

export interface UseContinueTurnResult {
  readonly continueTurn: (chatId: ChatId, messageId: MessageId) => void;
  readonly isPending: boolean;
}

export function useContinueTurn(): UseContinueTurnResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mutation = useContinueTurnMutation({ trpc, invalidation });
  return {
    continueTurn: (chatId, messageId): void => mutation.mutate({ chatId, messageId }),
    isPending: mutation.isPending,
  };
}
