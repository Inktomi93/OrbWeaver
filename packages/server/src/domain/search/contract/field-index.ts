import type { CharacterCard, CharacterSummary } from "@orb/contracts/character";
import type { UserId } from "@orb/kit/ids";
import type { FieldSearchParams, SuggestParams } from "./params.ts";
import type { FieldIndexResult, SearchSuggestion } from "./results.ts";

export type FieldIndexCard = Pick<CharacterCard, "name" | "description" | "personality" | "scenario" | "creatorNotes"> & Pick<CharacterSummary, "id">;

/** One graph's lexical cache owns every build until it settles, including builds invalidated mid-read. */
export interface FieldIndexCache extends AsyncDisposable {
  readonly fields: (params: FieldSearchParams, nowMs: number, load: () => Promise<readonly FieldIndexCard[]>) => Promise<FieldIndexResult>;
  readonly suggest: (params: SuggestParams, nowMs: number, load: () => Promise<readonly FieldIndexCard[]>) => Promise<SearchSuggestion[]>;
  readonly evict: (ownerId: UserId) => void;
}
