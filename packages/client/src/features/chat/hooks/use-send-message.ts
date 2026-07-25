// The composer's Send: branches on the ChatHandle discriminant, never an ambient isOptimistic boolean.
// A committed chat fires `send` directly; a draft lazily creates the chat (startChat) then commits the
// typed text as its first send. Stop/streaming state reads from useTurnPhase, never from isPending here
// — the send mutation's promise stays open for the whole turn, not just the user row's commit.

import type { UserIntent } from "@orb/contracts/preset";
import type { AssetId, CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { useState } from "react";
import { createEntityMutation, uploadAsset, useInvalidation, useTRPC } from "#data";
import type { ChatHandle, DraftSeed } from "#state";
import { clearDraftConfig, isCommitted, subscribeUserMessageCommitted } from "#state";
import type { DraftCarry } from "../lib/draft-commit";
import { resolveDraftCommit } from "../lib/draft-commit";
import { isSilencedTurnAbort } from "../lib/turn-abort-notice";

export type { DraftSeed } from "#state";

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

interface StartChatVars extends DraftCarry {
  // Mutable to match the wire schema's inferred array type under exactOptionalPropertyTypes.
  characterIds: CharacterId[];
  anchorPersonaId?: PersonaId | null | undefined;
  title?: string | null | undefined;
}

interface StartChatResult {
  readonly chat: { readonly id: ChatId };
}

const useStartChatMutation = createEntityMutation<StartChatVars, StartChatResult>({
  options: (trpc) => trpc.chat.startChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't start the chat.",
});

export interface UseSendMessageOptions {
  readonly handle: ChatHandle;
  readonly draftSeed?: DraftSeed | undefined;
  readonly intent?: Partial<UserIntent> | undefined;
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
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

async function uploadAttachments(attachments: readonly File[]): Promise<AssetId[]> {
  if (attachments.length === 0) {
    return [];
  }
  const stored = await Promise.all(attachments.map((file) => uploadAsset(file, "attachment")));
  return stored.map((s) => s.assetId);
}

export function useSendMessage(opts: UseSendMessageOptions): UseSendMessageResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const sendMutation = useSendMutation({ trpc, invalidation });
  const startChatMutation = useStartChatMutation({ trpc, invalidation });
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // We subscribe synchronously right before firing the mutation that produces the user's row — JS is
  // single-threaded and bus delivery needs a real network round-trip, so the subscribe always lands
  // before the event can arrive. A send that fails before commit never fires the user-role
  // messageCommitted, so onDraftCommitted never runs and the draft survives for retry untouched.
  const runSend = async (trimmed: string, attachments: readonly File[]): Promise<void> => {
    const attachmentAssetIds = await uploadAttachments(attachments);
    let committedChatId: ChatId | null = isCommitted(opts.handle) ? opts.handle.id : null;
    let unsubscribe: (() => void) | null = null;
    try {
      if (committedChatId === null) {
        const { draftKey, characterIds, carry } = resolveDraftCommit(opts.handle, opts.draftSeed);
        const result = await startChatMutation.mutateAsync({
          characterIds,
          anchorPersonaId: opts.draftSeed?.anchorPersonaId ?? null,
          title: opts.draftSeed?.title ?? null,
          ...carry,
        });
        committedChatId = result.chat.id;
        opts.onCommitted?.(committedChatId);
        if (draftKey !== null) {
          clearDraftConfig(draftKey);
        }
      }
      unsubscribe = subscribeUserMessageCommitted(committedChatId, () => opts.onDraftCommitted?.());
      const hasIntent = opts.intent !== undefined && Object.keys(opts.intent).length > 0;
      await sendMutation.mutateAsync({
        chatId: committedChatId,
        content: trimmed,
        ...(hasIntent ? { intent: opts.intent } : {}),
        ...(attachmentAssetIds.length > 0 ? { attachmentAssetIds } : {}),
      });
    } finally {
      unsubscribe?.();
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
