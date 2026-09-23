// `useContinueTurn` — the composer's EMPTY-Enter turn actions (continue + W-E generate). With
// `continueOnSend`, an empty Send on an assistant-tailed transcript extends that reply via `chat.continueTurn`
// (the same verb the wand's fireContinue drives). With `generateOnEmptySend` (W-E), an empty Send on a
// committed NON-assistant tail prompts a fresh reply via `chat.generate` — the fork-at-user-tail / empty-chat
// convenience. Both are bus-driven like every other turn mutation (they stream into the ghost and settle
// through the canon invalidation); the pure `resolveEmptySendAction` classifier picks which arm fires.
//
// TWO DOORS, RATIFIED (#568 — the duplicate-action-doors budget carries `chats::chat.continueTurn: 2` and
// `chats::chat.generate: 2`; the second door of each is `use-guided-actions.ts`). NOT the #539 echo class,
// which was two controls in ONE home where one carried a strict subset of the other's payload. These two are
// different AFFORDANCE KINDS on different planes: this hook is a SETTINGS-GATED KEYBOARD GESTURE (an empty
// Send, off entirely unless `continueOnSend`/`generateOnEmptySend` is on) that fires the BARE verb, while the
// wand's `fireContinue`/`fireResponse` are always-present composer ICONS whose payload carries the guided
// steer (and, for generate, `speakerCharacterId` + the `afterAssistant` responseNudge). Neither can stand in
// for the other: retiring this one would delete the no-pointer path and silently strand two shipped user
// settings; retiring the wand's would delete the only steerable arm. The budget stays at 2 rather than moving
// to the gate's `EXEMPT_PROCEDURES` on purpose — an exempt procedure leaves the census, so a THIRD door would
// go unnoticed, and a third door on this verb IS the drift this pair should red on.

import type { ChatId, MessageId } from "@orb/kit/ids";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { turnMutationToast } from "#lib";

interface ContinueTurnVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}
interface GenerateVars {
  readonly chatId: ChatId;
}

const useContinueTurnMutation = createEntityMutation<ContinueTurnVars, unknown>({
  options: (trpc) => trpc.chat.continueTurn.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't continue the reply."),
});

const useGenerateMutation = createEntityMutation<GenerateVars, unknown>({
  options: (trpc) => trpc.chat.generate.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't generate a reply."),
});

export interface UseContinueTurnResult {
  readonly continueTurn: (chatId: ChatId, messageId: MessageId) => void;
  /** W-E — empty-Enter generate on a committed non-assistant tail (a plain reply, no steer). The tail is
   *  never an assistant turn on this arm, so no `afterAssistant`/responseNudge is passed. */
  readonly generateReply: (chatId: ChatId) => void;
  readonly isPending: boolean;
}

export function useContinueTurn(): UseContinueTurnResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mutation = useContinueTurnMutation({ trpc, invalidation });
  const generate = useGenerateMutation({ trpc, invalidation });
  return {
    continueTurn: (chatId, messageId): void => mutation.mutate({ chatId, messageId }),
    generateReply: (chatId): void => generate.mutate({ chatId }),
    isPending: mutation.isPending || generate.isPending,
  };
}
