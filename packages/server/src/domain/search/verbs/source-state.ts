import type { ResolveCorpusSourceState } from "@orb/contracts/search";
import type { SearchContext } from "../context.ts";
import { readCorpusSourceState } from "../persistence/source.ts";

/** Metadata only; the canon consumer owns membership and server-side content projection. */
export function createSourceState(ctx: Pick<SearchContext, "db">): ResolveCorpusSourceState {
  return (source) => readCorpusSourceState(ctx.db, source);
}
