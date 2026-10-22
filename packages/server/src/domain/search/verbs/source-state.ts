import type { ResolveCorpusSourceState } from "@orb/contracts/search";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { SearchContext } from "../contract/service.ts";
import { readCorpusSourceState } from "../persistence/source.ts";

/** Metadata only; the canon consumer owns membership and server-side content projection. */
export function createSourceState(ctx: DbAssemblyInput<Pick<SearchContext, "db">>): ResolveCorpusSourceState {
  const db = databaseForOwner(ctx.db);
  return (source) => readCorpusSourceState(db, source);
}
