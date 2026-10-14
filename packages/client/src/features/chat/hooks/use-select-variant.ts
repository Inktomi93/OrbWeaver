// One saved-variant selection write, shared by the variant strip and the greeting's saved-reply picker.
// Both move the same stored pointer and reconcile through variantSelected; neither owns a second cache pipeline.

import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

interface SelectVariantVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly timeZone: string;
}

export const useSelectVariantMutation = createEntityMutation<SelectVariantVars, unknown>({
  options: (trpc) => trpc.chat.selectVariant.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch to that variant.",
});
