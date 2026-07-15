import type { CharacterContextState } from "#lib";
import { useSelectedCharacterId } from "#state";

export function useCharacterContextState(): CharacterContextState | null {
  const id = useSelectedCharacterId();
  return id === null ? null : { characterId: id };
}
