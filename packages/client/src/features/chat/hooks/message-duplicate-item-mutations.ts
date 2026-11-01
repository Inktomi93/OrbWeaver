import type { ChatId, MessageId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

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
