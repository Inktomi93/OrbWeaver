import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";
import { MESSAGE_REATTRIBUTE_VOICE_FAILED } from "../lib/message-action-names.ts";

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
