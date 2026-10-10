import type { CharacterContext } from "../context.ts";
import type { CharacterService } from "../contract/service.ts";
import { countOwnedCharacters } from "../persistence/queries.ts";
import { characterListLens } from "../substrate/list-lens.ts";

export function createCount(ctx: CharacterContext): CharacterService["count"] {
  return async (params) => await countOwnedCharacters(ctx.db, params.principal.userId, characterListLens(params));
}
