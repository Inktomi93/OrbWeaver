import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import type { FindByHandleParams } from "./params.ts";

export interface GalleryCharacterOps {
  readonly resolveCharacterHandle: (ownerId: UserId, characterId: CharacterId) => Promise<CharacterHandle | null>;
  readonly findCharacterByHandle: (params: FindByHandleParams) => Promise<CharacterId | null>;
}
