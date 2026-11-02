import type { CharacterContextState } from "#lib";
import { useSelectedCharacterId } from "#state";

/** The selected character, as the CONTEXT pane boundary's reset keys. */
export function useCharacterContextResetKeys(): readonly unknown[] {
  return [useSelectedCharacterId()];
}

export function useCharacterContextState(): CharacterContextState | null {
  const id = useSelectedCharacterId();
  return id === null ? null : { characterId: id };
}
