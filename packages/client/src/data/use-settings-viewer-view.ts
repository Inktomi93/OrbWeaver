// The ONE home of the `SettingsViewerView` projection (SET-SEAMS §5 / client-architecture-lockdown §5
// rule 6). A settings pane def and a settings-section contribution both gate on `when(viewer)`, and the
// projection they consume is state-owned (`#state` cannot import `#data`'s `Viewer` — `client-state-below-
// data` has no type-only exemption). The DERIVATION homes here, in `#data`, so the settings shell (nav +
// search) and every host pane's surface (render) run the SAME predicate off ONE cached read instead of
// re-spelling `globalRole === "owner" || "admin"` per surface.
//
// A non-suspense probe deliberately: `when` gating must never block a pane from painting — an unresolved
// viewer reads as non-admin, and the shell re-applies a deep link once visibility GROWS.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SettingsViewerView } from "#state";
import { useTRPC } from "./trpc";

/** The narrow viewer projection a settings `when` predicate consumes. Memoized on the derived flags so a
 *  consumer's `useMemo` over it is stable across unrelated re-renders. */
export function useSettingsViewerView(): SettingsViewerView {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.sessions.me.queryOptions());
  const isAdmin = data?.globalRole === "owner" || data?.globalRole === "admin";
  return useMemo((): SettingsViewerView => ({ isAdmin }), [isAdmin]);
}
