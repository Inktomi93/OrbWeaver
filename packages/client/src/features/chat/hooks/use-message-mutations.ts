import type { ForkResult, MessageView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { turnMutationToast } from "#lib";
import { MESSAGE_MOVE_FAILED, MESSAGE_REATTRIBUTE_VOICE_FAILED } from "../lib/message-action-names.ts";

export const useHideMutation = createEntityMutation<inferInput<Trpc["chat"]["setMessageHidden"]>, unknown>({
  options: (trpc) => trpc.chat.setMessageHidden.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't change that message's visibility.",
});

export const useDeleteMutation = createEntityMutation<inferInput<Trpc["chat"]["deleteMessages"]>, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete that message.",
});

export const useForkMutation = createEntityMutation<inferInput<Trpc["chat"]["forkChat"]>, ForkResult>({
  options: (trpc) => trpc.chat.forkChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't fork this chat.",
});

// Undo/revert the last continuation on THIS reply's shown swipe (F2). Bus-driven like the other row
// mutations — the verb emits `messageCommitted`, the surface refetches; no manual cache write here.
export const useUndoContinueMutation = createEntityMutation<inferInput<Trpc["chat"]["undoContinue"]>, unknown>({
  options: (trpc) => trpc.chat.undoContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't undo the continuation.",
});

export const useRevertContinueMutation = createEntityMutation<inferInput<Trpc["chat"]["revertContinue"]>, unknown>({
  options: (trpc) => trpc.chat.revertContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't re-apply the continuation.",
});

interface DuplicateVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

// The verb emits `messageCommitted` for the new tail slot, so the transcript refetches off the bus.
export const useDuplicateMutation = createEntityMutation<DuplicateVars, unknown>({
  options: (trpc) => trpc.chat.duplicateMessage.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't duplicate that message.",
});

export const useEditMessageMutation = createEntityMutation<inferInput<Trpc["chat"]["editMessage"]>, unknown>({
  options: (trpc) => trpc.chat.editMessage.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that edit.",
});

export const useMoveMessageMutation = createEntityMutation<inferInput<Trpc["chat"]["moveMessage"]>, unknown>({
  options: (trpc) => trpc.chat.moveMessage.mutationOptions(),
  busDriven: true,
  errorToast: MESSAGE_MOVE_FAILED,
});

export const useEditReasoningMutation = createEntityMutation<inferInput<Trpc["chat"]["editReasoning"]>, unknown>({
  options: (trpc) => trpc.chat.editReasoning.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that reasoning.",
});

export const useClearReasoningMutation = createEntityMutation<inferInput<Trpc["chat"]["clearReasoning"]>, unknown>({
  options: (trpc) => trpc.chat.clearReasoning.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't clear that reasoning.",
});

// Module-scope factory (§13.1) — BUS-DRIVEN: `deleteMessages` emits messagesDeleted (→ chatReads) on the
// OPEN chat, delivered by the active subscription → the seam refetches. `busDriven`; the removed
// keys were a redundant backstop (the mutation-vs-bus rule, invalidation.ts).
export const useDeleteMessages = createEntityMutation<inferInput<Trpc["chat"]["deleteMessages"]>, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the selected messages.",
});

export const useEditToolCall = createEntityMutation<inferInput<Trpc["chat"]["editToolCall"]>, MessageView>({
  options: (trpc) => trpc.chat.editToolCall.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update that tool call.",
});

// The ONE turn-error mapper (`lib/turn-abort-notice.ts`), not a bare string: a swipe refused for CONTENTION
// (`locked` — another turn holds this room) is the one turn failure the reader can act on, and the bare
// fallback hid it behind "Couldn't generate that swipe" while the old variant sat there with no ghost.
export const useSwipeMutation = createEntityMutation<inferInput<Trpc["chat"]["swipe"]>, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't generate that swipe."),
});

// busDriven: in-place steps emit `messageEdited`; preserved prose emits `variantSelected`. Both invalidate canon —
// the row re-renders from the SERVER's bytes, never from an optimistic local swap (the card is the source of
// truth for what an alternate says, and it may have been edited since the seed).
export const useSetSeededGreeting = createEntityMutation<inferInput<Trpc["chat"]["setSeededGreeting"]>, unknown>({
  options: (trpc) => trpc.chat.setSeededGreeting.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch to that greeting.",
});

interface ReattributeVoiceVars {
  readonly chatId: ChatId;
  readonly messageIds: MessageId[];
  readonly characterId: CharacterId;
}

// The verb emits `messageEdited` for the row, so the transcript follows the bus.
export const useReattributeVoice = createEntityMutation<ReattributeVoiceVars, unknown>({
  options: (trpc) => trpc.chat.reattributeMessages.mutationOptions(),
  busDriven: true,
  errorToast: MESSAGE_REATTRIBUTE_VOICE_FAILED,
});
