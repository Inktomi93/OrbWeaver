// The ✨ utility-menu verbs (W-D) — the NON-guided composer tools: Simple send (chat.commitMessage, the
// D56 post-without-generate lever), Undo/Revert continuation (chat.undoContinue/revertContinue, targeting the
// tail assistant slot — a "act on the most recent reply" convenience mirroring the per-message row buttons).
// Kept OUT of use-guided-actions (those are guided STEER fires; these are plain verbs) so each hook stays one
// concern. Recover input (the fired-steer ring recall) is pure client state (useRecentSteers), no verb.

import type { ChatId, MessageId } from "@orb/kit/ids";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { isSilencedTurnAbort } from "../lib/turn-abort-notice";

interface CommitMessageVars {
  readonly chatId: ChatId;
  readonly content: string;
}
interface ContinueRestoreVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

const useCommitMessageMutation = createEntityMutation<CommitMessageVars, unknown>({
  options: (trpc) => trpc.chat.commitMessage.mutationOptions(),
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't post your message."),
});

const useUndoContinueMutation = createEntityMutation<ContinueRestoreVars, unknown>({
  options: (trpc) => trpc.chat.undoContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't undo the continuation.",
});

const useRevertContinueMutation = createEntityMutation<ContinueRestoreVars, unknown>({
  options: (trpc) => trpc.chat.revertContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't re-apply the continuation.",
});

export interface UseComposerUtilitiesResult {
  /** Post the user text WITHOUT generating a reply (Simple send). Clears the composer on success. */
  readonly commitMessage: (content: string, onDone: () => void) => void;
  /** Undo the last continuation on the tail assistant slot. */
  readonly undoContinue: (messageId: MessageId) => void;
  /** Re-apply the last reverted continuation on the tail assistant slot. */
  readonly revertContinue: (messageId: MessageId) => void;
}

export function useComposerUtilities(chatId: ChatId | null): UseComposerUtilitiesResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const commit = useCommitMessageMutation({ trpc, invalidation });
  const undo = useUndoContinueMutation({ trpc, invalidation });
  const revert = useRevertContinueMutation({ trpc, invalidation });

  return {
    commitMessage: (content, onDone): void => {
      if (chatId === null || content.trim().length === 0) {
        return;
      }
      commit.mutate({ chatId, content }, { onSuccess: onDone });
    },
    undoContinue: (messageId): void => {
      if (chatId === null) {
        return;
      }
      undo.mutate({ chatId, messageId });
    },
    revertContinue: (messageId): void => {
      if (chatId === null) {
        return;
      }
      revert.mutate({ chatId, messageId });
    },
  };
}
