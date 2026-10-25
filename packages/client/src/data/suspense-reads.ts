// The suspending reads, each checked against its boundary. A read that suspends outside a QueryBoundary falls
// to the nearest Suspense above it (a region skeleton or the app root), which has no error state, no retry and
// no reserved box (client-architecture-state-and-gates.md §11). Client code imports these names, never the
// TanStack hooks (`no-restricted-imports` in eslint.config.ts), so every suspending read passes this door.
//
// The check is off until `requireQueryBoundary()` runs: the dev bootstrap turns it on, so a missing boundary
// throws at the first render of the read, and the component-test census turns it on over the production
// surfaces. A production build never throws for a missing boundary.

import {
  useSuspenseInfiniteQuery as tanstackUseSuspenseInfiniteQuery,
  useSuspenseQueries as tanstackUseSuspenseQueries,
  useSuspenseQuery as tanstackUseSuspenseQuery,
} from "@tanstack/react-query";
import { createContext, use } from "react";

/** True for every descendant of a QueryBoundary. */
export const QueryBoundaryScope = createContext(false);

let enforced = false;

/** Make a suspending read outside a QueryBoundary throw. */
export function requireQueryBoundary(): void {
  enforced = true;
}

/** The message names the rule so a test reading the console can tell this error from any other. */
const MISSING_QUERY_BOUNDARY = "[query-boundary] A suspending read rendered outside a QueryBoundary: wrap the surface in <QueryBoundary>.";

function useBoundaryCheck(): void {
  const inBoundary = use(QueryBoundaryScope);
  if (enforced && !inBoundary) {
    throw new Error(MISSING_QUERY_BOUNDARY);
  }
}

export const useSuspenseQuery: typeof tanstackUseSuspenseQuery = (options, queryClient) => {
  useBoundaryCheck();
  return tanstackUseSuspenseQuery(options, queryClient);
};

export const useSuspenseQueries: typeof tanstackUseSuspenseQueries = (options, queryClient) => {
  useBoundaryCheck();
  return tanstackUseSuspenseQueries(options, queryClient);
};

export const useSuspenseInfiniteQuery: typeof tanstackUseSuspenseInfiniteQuery = (options, queryClient) => {
  useBoundaryCheck();
  return tanstackUseSuspenseInfiniteQuery(options, queryClient);
};
