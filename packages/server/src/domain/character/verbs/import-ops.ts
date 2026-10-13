// Bound import authority is the original authenticated Principal, never a role re-derived from its id.
import type { Principal } from "@orb/contracts/identity";
import type { CharacterImportOps, ImportCharacterPort } from "../contract/import-ops.ts";

export function createCharacterImportOps(principal: Principal, character: ImportCharacterPort): CharacterImportOps {
  const ownerId = principal.userId;
  return {
    createCharacter: async ({ input, importedFrom, importHash }): ReturnType<CharacterImportOps["createCharacter"]> => {
      const created = await character.create({ principal, input, provenance: { importedFrom, importHash } });
      return { characterId: created.id };
    },
    findByImportHash: async ({ importHash }) => (await character.findByImportHash({ ownerId, importHash }))?.characterId ?? null,
    findByHandle: async ({ handle }) => (await character.findByHandle({ ownerId, handle }))?.characterId ?? null,
    findByName: async ({ name, caseInsensitive }) =>
      (await character.findByName({ ownerId, name, ...(caseInsensitive === undefined ? {} : { caseInsensitive }) })).map((ref) => ref.characterId),
    attachImportedArt: ({ characterId, avatarAssetId, importHash }) => character.attachImportedArt({ ownerId, characterId, avatarAssetId, importHash }),
  };
}
