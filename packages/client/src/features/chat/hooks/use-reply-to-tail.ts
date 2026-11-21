// The tail line's reply action. It calls `chat.replyToTail`, never `generate`: every member sees the action at once,
// and the server starts at most one round per unanswered line, deferring a member's press while the host is dark (the
// one-round-per-tail ruling in `packages/server/src/domain/chat/verbs/turn.ts`). Bus-driven like every turn mutation.

import type { ChatId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { turnMutationToast, viewerTimeZone } from "#lib";
import { REPLY_FAILURE_LINE, recordTurnFailure } from "../lib/reply-failure.ts";

const START_FAILED_LEAD = "Couldn't start the reply.";

const useReplyToTailMutation = createEntityMutation<inferInput<Trpc["chat"]["replyToTail"]>, unknown>({
  options: (trpc) => trpc.chat.replyToTail.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, START_FAILED_LEAD),
});

export interface ReplyToTail {
  readonly reply: () => void;
  readonly isPending: boolean;
}

export function useReplyToTail(chatId: ChatId): ReplyToTail {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mutation = useReplyToTailMutation({ trpc, invalidation, failureShownInline: REPLY_FAILURE_LINE });
  return {
    reply: (): void =>
      mutation.mutate({ chatId, timeZone: viewerTimeZone() }, { onError: (error): void => recordTurnFailure(chatId, error, START_FAILED_LEAD) }),
    isPending: mutation.isPending,
  };
}
