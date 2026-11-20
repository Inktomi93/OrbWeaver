// Bound import authority is the original authenticated Principal, never a role re-derived from its id.
import type { Principal } from "@orb/contracts/identity";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { CharacterImportOps, ImportCharacterPort } from "../contract/import-ops.ts";

export function createCharacterImportOps(principal: Principal, character: ImportCharacterPort): CharacterImportOps {
  const ownerId = principal.userId;
  return {
    createCharacter: async ({ input, importedFrom, importHash, background }): ReturnType<CharacterImportOps["createCharacter"]> => {
      const created = await character.create({
        principal,
        input,
        provenance: { importedFrom, importHash, ...(background === undefined ? {} : { background }) },
      });
      return { characterId: created.id };
    },
    findByImportHash: async ({ importHash }) => (await character.findByImportHash({ ownerId, importHash }))?.characterId ?? null,
    findByHandle: async ({ handle }) => (await character.findByHandle({ ownerId, handle }))?.characterId ?? null,
    findByName: async ({ name, caseInsensitive }) =>
      (await character.findByName({ ownerId, name, ...(caseInsensitive === undefined ? {} : { caseInsensitive }) })).map((ref) => ref.characterId),
    attachImportedArt: ({ characterId, avatarAssetId, importHash }) => character.attachImportedArt({ ownerId, characterId, avatarAssetId, importHash }),
    admitsImportedArt: ({ characterId }) => character.admitsImportedArt({ ownerId, characterId }),
    characterName: async ({ characterId }): ReturnType<CharacterImportOps["characterName"]> => {
      try {
        return (await character.get({ principal, characterId })).name;
      } catch (err) {
        // A row deleted since the import matched it: the caller names the card by its own name instead.
        if (err instanceof CharacterNotFoundError) {
          return null;
        }
        throw err;
      }
    },
  };
}
