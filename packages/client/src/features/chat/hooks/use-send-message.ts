// The composer's Send: fires `chat.send` against the room's real chat row. Stop/streaming state reads from
// useTurnPhase, never from isPending here — the send mutation's promise stays open for the whole turn, not
// just the user row's commit.
//
// IT NO LONGER CREATES ANYTHING (D166). This hook used to carry
// the draft→committed COMMIT PATH: a first send lazily called `chat.startChat` with a nine-field carry of
// pre-send config (`resolveDraftCommit`), then sent into the room it had just minted. That path is gone —
// the room exists from the creation click, so a send is a send. Two whole failure classes go with it: the
// scope-key flip mid-send (the "first send doesn't clear the composer" bug) and the double-mint on a retry.

import type { AssetId, ChatId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, UploadRefusedError, useInvalidation, useTRPC, useUploadAsset } from "#data";
import { notify, trpcErrorCode, turnMutationToast, viewerTimeZone } from "#lib";
import { holdRoomForSend, subscribeUserMessageCommitted } from "#state";
import { SEND_FAILED_TITLE } from "../lib/send-failure-copy.ts";

// TData is `unknown` — the sent turn is bus-driven (messageCommitted/turnStarted/...), never read back.
const useSendMutation = createEntityMutation<inferInput<Trpc["chat"]["send"]>, unknown>({
  options: (trpc) => trpc.chat.send.mutationOptions(),
  // busDriven: the turn's messageCommitted/turnCompleted bus events already run the full chatReads
  // invalidation; a mutation-side invalidate here would double-refetch (the observed 4-5x/send storm).
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, SEND_FAILED_TITLE),
});

export interface UseSendMessageOptions {
  readonly chatId: ChatId;
  /** Fires once the bus confirms the caller's own user row committed — the composer clears its draft
   *  here, never optimistically on submit, so a failed send leaves the draft intact for retry. */
  readonly onDraftCommitted?: (() => void) | undefined;
}

export interface UseSendMessageResult {
  readonly send: (content: string, attachments?: readonly File[]) => void;
  readonly isPending: boolean;
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

  // We subscribe synchronously right before firing the mutation that produces the user's row — JS is
  // single-threaded and bus delivery needs a real network round-trip, so the subscribe always lands
  // before the event can arrive. A send that fails before commit never fires the user-role
  // messageCommitted, so onDraftCommitted never runs and the draft survives for retry untouched.
  const runSend = async (trimmed: string, attachments: readonly File[]): Promise<void> => {
    // Held from the upload until the send settles: leaving a new room mid-send must not reap it under the send.
    using _hold = holdRoomForSend(opts.chatId);
    // The upload is a raw POST outside the send mutation, so its `errorToast` never sees a refusal: say it
    // here, with the server's own reason when it gave one, and rethrow so the draft and strip stay put.
    const attachmentAssetIds = await uploadAttachments(upload, attachments).catch((err: unknown) => {
      notify.error({ title: SEND_FAILED_TITLE, ...(err instanceof UploadRefusedError ? { description: err.reason } : {}) });
      throw err;
    });
    const unsubscribe = subscribeUserMessageCommitted(opts.chatId, () => opts.onDraftCommitted?.());
    try {
      await sendMutation.mutateAsync({
        chatId: opts.chatId,
        content: trimmed,
        timeZone: viewerTimeZone(),
        ...(attachmentAssetIds.length > 0 ? { attachmentAssetIds } : {}),
      });
    } catch (error) {
      // The server found no such room: re-read it, and a room that is gone is left for the chat list (`useLeaveGoneRoom`).
      if (trpcErrorCode(error) === "NOT_FOUND") {
        invalidation.invalidateFilters([trpc.chat.getChat.queryFilter({ chatId: opts.chatId })]);
      }
      throw error;
    } finally {
      unsubscribe();
    }
  };

  const send = (content: string, attachments: readonly File[] = []): void => {
    const trimmed = content.trim();
    if (trimmed.length === 0 && attachments.length === 0) {
      return;
    }
    setIsPending(true);
    // Only a send failure reaches the mutation's errorToast; an upload rejection is dropped here with no notice.
    runSend(trimmed, attachments)
      .catch(() => undefined)
      .finally(() => setIsPending(false));
  };

  return {
    send,
    isPending,
  };
}
