import type { CharacterLibraryLens } from "@orb/contracts/character";
import type { CharacterListFilter } from "../contract/params.ts";

/** Normalize one shared lens for pages, counts and grouped censuses. */
export function characterListLens(params: CharacterLibraryLens): CharacterListFilter {
  const { search, starred, archived, includeTagIds, excludeTagIds } = params;
  const needle = search?.trim().toLowerCase() ?? "";
  return {
    ...(needle === "" ? {} : { search: needle }),
    ...(starred === undefined ? {} : { starred }),
    ...(archived === undefined ? {} : { archived }),
    ...(includeTagIds === undefined || includeTagIds.length === 0 ? {} : { includeTagIds }),
    ...(excludeTagIds === undefined || excludeTagIds.length === 0 ? {} : { excludeTagIds }),
  };
}
