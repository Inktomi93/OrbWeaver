import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The rewrite generation — returns the revised greeting text (no cache/bus effect; the result is previewed). */
export const useRewriteGreetingMutation = createEntityMutation<
  inferInput<Trpc["character"]["rewriteGreeting"]>,
  inferOutput<Trpc["character"]["rewriteGreeting"]>
>({
  options: (trpc) => trpc.character.rewriteGreeting.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rewrite the greeting.",
});

/** The new-greeting generation — returns a fresh greeting text (no cache/bus effect; the result is previewed). */
export const useGenerateGreetingMutation = createEntityMutation<
  inferInput<Trpc["character"]["generateGreeting"]>,
  inferOutput<Trpc["character"]["generateGreeting"]>
>({
  options: (trpc) => trpc.character.generateGreeting.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't generate the greeting.",
});
