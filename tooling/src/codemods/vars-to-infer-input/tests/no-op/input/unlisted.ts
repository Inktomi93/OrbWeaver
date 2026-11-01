import { createEntityMutation } from "#data";

type OtherVars = { readonly id: string };

// The plan lists OtherVars for another file only, so this site is not touched.
export const useOther = createEntityMutation<OtherVars, unknown>({
  options: (trpc) => trpc.chat.other.mutationOptions(),
});
