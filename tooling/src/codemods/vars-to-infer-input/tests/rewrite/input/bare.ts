import { createEntityMutation } from "#data";

type PinVars = { readonly chatId: string };

export const usePin = createEntityMutation<PinVars, unknown>({
  options: (trpc) => trpc.chat.pin.mutationOptions(),
});
