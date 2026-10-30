import type { FindByHandleParams } from "@orb/contracts/character";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";

export interface GalleryCharacterOps {
  readonly resolveCharacterHandle: (ownerId: UserId, characterId: CharacterId) => Promise<CharacterHandle | null>;
  readonly findCharacterByHandle: (params: FindByHandleParams) => Promise<CharacterId | null>;
}
