// QueryInlineStates (derive-modernization-audit §W4): the non-suspense sibling of QueryBoundary. A
// dialog/poll read (a plain `useQuery`, mounted-while-open or self-refetching) can't suspend, so it
// hand-ladders `isPending ? … : isError ? … : empty ? …` inline — the exact three-copy shape that drifts
// across admin panes. This bakes the ladder ONCE: pending/empty in `muted`, error in `destructive`, and
// null (render the rows below) on a successful non-empty read.

import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface QueryInlineStatesProps {
  /** The non-suspense query's status flags — pass a plain `useQuery` result straight through. */
  readonly status: { readonly isPending: boolean; readonly isError: boolean; readonly isSuccess: boolean };
  /** True when the successful read returned no rows — renders `empty` instead of the (absent) list. */
  readonly isEmpty: boolean;
  /** Loading copy, e.g. "Loading sessions…". */
  readonly pending: string;
  /** Error copy, e.g. "Couldn't load the sessions — try reopening this dialog.". */
  readonly error: string;
  /** No-rows copy, e.g. "No sessions on record — they've never signed in.". */
  readonly empty: string;
}

/**
 * The pending/error/empty status line for a non-suspense read. Renders nothing once the read succeeds
 * with rows — the caller renders its list beneath. The error tone is `destructive`; pending + empty are
 * `muted` (the shape both admin panes hand-rolled).
 */
export function QueryInlineStates({ status, isEmpty, pending, error, empty }: QueryInlineStatesProps): ReactElement | null {
  if (status.isPending) {
    return <Text tone="muted">{pending}</Text>;
  }
  if (status.isError) {
    return <Text tone="destructive">{error}</Text>;
  }
  if (status.isSuccess && isEmpty) {
    return <Text tone="muted">{empty}</Text>;
  }
  return null;
}
