// Whether a confirmed delete of a character is pending or done: read from the shared mutation cache, so the editor of that character
// needs nothing threaded to it from the library row that confirmed the delete. A failed delete is not a delete, so the character's
// editor arrives as it would have.

import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "#data";

// The mutation cache types variables as `unknown`.
function removesCharacter(variables: unknown, characterId: string): boolean {
  return typeof variables === "object" && variables !== null && "characterId" in variables && variables.characterId === characterId;
}

/** A reader, not a value: the arrival hook asks at the moment it would take focus, so the answer is the delete's state then. */
export function useCharacterDeleted(characterId: string): () => boolean {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (): boolean =>
    queryClient.getMutationCache().findAll({
      mutationKey: trpc.character.remove.mutationKey(),
      predicate: (mutation) => mutation.state.status !== "error" && removesCharacter(mutation.state.variables, characterId),
    }).length > 0;
}
