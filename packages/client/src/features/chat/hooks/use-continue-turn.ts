// `useContinueTurn` — the composer's EMPTY-Enter turn actions (continue + generate). With `emptyEnterReplies`,
// an empty Send on an assistant-tailed transcript extends that reply via `chat.continueTurn` (the same verb the
// wand's fireContinue drives), and an empty Send on a committed NON-assistant tail prompts a fresh reply via
// `chat.generate` — the fork-at-user-tail / empty-chat
// convenience. Both are bus-driven like every other turn mutation (they stream into the ghost and settle
// through the canon invalidation); the pure `resolveEmptySendAction` classifier picks which arm fires.
//
// TWO DOORS, RATIFIED (#568 — `chat.continueTurn` and `chat.generate` each have two doors; the second
// door of each is `use-guided-actions.ts`). NOT the #539 echo class,
// which was two controls in ONE home where one carried a strict subset of the other's payload. These two are
// different AFFORDANCE KINDS on different planes: this hook is a SETTINGS-GATED KEYBOARD GESTURE (an empty
// Send, off entirely unless `emptyEnterReplies` is on) that fires the BARE verb, while the
// wand's `fireContinue`/`fireResponse` are always-present composer ICONS whose payload carries the guided
// steer (and, for generate, `speakerCharacterId` + the `afterAssistant` responseNudge). Neither can stand in
// for the other: retiring this one would delete the no-pointer path and silently strand two shipped user
// settings; retiring the wand's would delete the only steerable arm. The budget stays at 2 rather than moving
// to the gate's `EXEMPT_PROCEDURES` on purpose — an exempt procedure leaves the census, so a THIRD door would
// go unnoticed, and a third door on this verb IS the drift this pair should red on.

import type { ChatId, MessageId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { isSilencedTurnAbort, turnMutationToast, viewerTimeZone } from "#lib";
import { REPLY_FAILURE_LINE, recordReplyFailure, recordTurnFailure } from "../lib/reply-failure.ts";
import { REPLY_NOT_WRITTEN_LEAD } from "../lib/send-failure-copy.ts";

const CONTINUE_FAILED_LEAD = "Couldn't continue the reply.";

const useContinueTurnMutation = createEntityMutation<inferInput<Trpc["chat"]["continueTurn"]>, unknown>({
  options: (trpc) => trpc.chat.continueTurn.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, CONTINUE_FAILED_LEAD),
});

const useGenerateMutation = createEntityMutation<inferInput<Trpc["chat"]["generate"]>, unknown>({
  options: (trpc) => trpc.chat.generate.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, REPLY_NOT_WRITTEN_LEAD),
});

export interface UseContinueTurnResult {
  readonly continueTurn: (chatId: ChatId, messageId: MessageId) => void;
  /** W-E — empty-Enter generate on a committed non-assistant tail (a plain reply, no steer). The tail is
   *  never an assistant turn on this arm, so no `afterAssistant`/responseNudge is passed. The reply-failure line's
   *  retry is this same call; it passes `settle` to state its own outcome. */
  readonly generateReply: (chatId: ChatId, settle?: GenerateSettle) => void;
  readonly isPending: boolean;
}

/** A caller's own handling of one generate's outcome, beside the hook's. */
interface GenerateSettle {
  readonly onError: (error: unknown) => void;
  readonly onSuccess: () => void;
}

/** The composer's reply-failure line states a failure of either action, so no toast repeats it. */
export function useContinueTurn(): UseContinueTurnResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mutation = useContinueTurnMutation({ trpc, invalidation, failureShownInline: REPLY_FAILURE_LINE });
  const generate = useGenerateMutation({ trpc, invalidation, failureShownInline: REPLY_FAILURE_LINE });
  return {
    continueTurn: (chatId, messageId): void =>
      mutation.mutate({ chatId, messageId, timeZone: viewerTimeZone() }, { onError: (error): void => recordTurnFailure(chatId, error, CONTINUE_FAILED_LEAD) }),
    // A reply failing here is retried by the same call, so the line offers Retry.
    generateReply: (chatId, settle): void =>
      generate.mutate(
        { chatId, timeZone: viewerTimeZone() },
        settle ?? { onError: (error): void => (isSilencedTurnAbort(error) ? undefined : recordReplyFailure(chatId, error, { lead: REPLY_NOT_WRITTEN_LEAD })) },
      ),
    isPending: mutation.isPending || generate.isPending,
  };
}
