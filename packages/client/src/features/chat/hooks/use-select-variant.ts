// One saved-variant selection write, shared by the variant strip and the greeting's saved-reply picker.
// Both move the same stored pointer and reconcile through variantSelected; neither owns a second cache pipeline.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useSelectVariantMutation = createEntityMutation<inferInput<Trpc["chat"]["selectVariant"]>, unknown>({
  options: (trpc) => trpc.chat.selectVariant.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch to that variant.",
});
