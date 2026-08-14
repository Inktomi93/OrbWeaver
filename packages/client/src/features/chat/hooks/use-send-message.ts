// The composer's Send: fires `chat.send` against the room's real chat row. Stop/streaming state reads from
// useTurnPhase, never from isPending here — the send mutation's promise stays open for the whole turn, not
// just the user row's commit.
//
// IT NO LONGER CREATES ANYTHING (chat-creation-draft-mode-replacement.md §4.1, R1). This hook used to carry
// the draft→committed COMMIT PATH: a first send lazily called `chat.startChat` with a nine-field carry of
// pre-send config (`resolveDraftCommit`), then sent into the room it had just minted. That path is gone —
// the room exists from the creation click, so a send is a send. Two whole failure classes go with it: the
// scope-key flip mid-send (the "first send doesn't clear the composer" bug) and the double-mint on a retry.

import type { UserIntent } from "@orb/contracts/preset";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { useState } from "react";
import { createEntityMutation, useInvalidation, useTRPC, useUploadAsset } from "#data";
import { subscribeUserMessageCommitted } from "#state";
import { isSilencedTurnAbort } from "../lib/turn-abort-notice.ts";

interface SendVars {
  readonly chatId: ChatId;
  readonly content: string;
  readonly intent?: Partial<UserIntent> | undefined;
  readonly attachmentAssetIds?: AssetId[] | undefined;
}

// TData is `unknown` — the sent turn is bus-driven (messageCommitted/turnStarted/...), never read back.
const useSendMutation = createEntityMutation<SendVars, unknown>({
  options: (trpc) => trpc.chat.send.mutationOptions(),
  // busDriven: the turn's messageCommitted/turnCompleted bus events already run the full chatReads
  // invalidation; a mutation-side invalidate here would double-refetch (the observed 4-5x/send storm).
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't send your message."),
});

export interface UseSendMessageOptions {
  readonly chatId: ChatId;
  readonly intent?: Partial<UserIntent> | undefined;
  /** Fires once the bus confirms the caller's own user row committed — the composer clears its draft
   *  here, never optimistically on submit, so a failed send leaves the draft intact for retry. */
  readonly onDraftCommitted?: (() => void) | undefined;
}

export interface UseSendMessageResult {
  readonly send: (content: string, attachments?: readonly File[]) => void;
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly clearError: () => void;
}

async function uploadAttachments(upload: ReturnType<typeof useUploadAsset>, attachments: readonly File[]): Promise<AssetId[]> {
  if (attachments.length === 0) {
    return [];
  }
  const stored = await Promise.all(attachments.map((file) => upload(file, "attachment")));
  return stored.map((s) => s.assetId);
}

export function useSendMessage(opts: UseSendMessageOptions): UseSendMessageResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const upload = useUploadAsset();
  const sendMutation = useSendMutation({ trpc, invalidation });
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // We subscribe synchronously right before firing the mutation that produces the user's row — JS is
  // single-threaded and bus delivery needs a real network round-trip, so the subscribe always lands
  // before the event can arrive. A send that fails before commit never fires the user-role
  // messageCommitted, so onDraftCommitted never runs and the draft survives for retry untouched.
  const runSend = async (trimmed: string, attachments: readonly File[]): Promise<void> => {
    const attachmentAssetIds = await uploadAttachments(upload, attachments);
    const unsubscribe = subscribeUserMessageCommitted(opts.chatId, () => opts.onDraftCommitted?.());
    try {
      const hasIntent = opts.intent !== undefined && Object.keys(opts.intent).length > 0;
      await sendMutation.mutateAsync({
        chatId: opts.chatId,
        content: trimmed,
        ...(hasIntent ? { intent: opts.intent } : {}),
        ...(attachmentAssetIds.length > 0 ? { attachmentAssetIds } : {}),
      });
    } finally {
      unsubscribe();
    }
  };

  const send = (content: string, attachments: readonly File[] = []): void => {
    const trimmed = content.trim();
    if (trimmed.length === 0 && attachments.length === 0) {
      return;
    }
    setError(null);
    setIsPending(true);
    runSend(trimmed, attachments)
      .catch((err: unknown) => setError(err))
      .finally(() => setIsPending(false));
  };

  return {
    send,
    isPending,
    error,
    clearError: (): void => setError(null),
  };
}
