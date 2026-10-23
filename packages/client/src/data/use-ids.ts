// The runtime's id source as a component reads it. `AppDataProviders` is the one place that provides it.

import type { IdSource } from "@orb/kit/ids";
import { createContext, use } from "react";

export const IdsContext = createContext<IdSource | null>(null);

/** The mounted runtime's id source, for ids the client persists. */
export function useIds(): IdSource {
  const ids = use(IdsContext);
  if (ids === null) {
    throw new Error("useIds needs the client runtime's providers above it");
  }
  return ids;
}
