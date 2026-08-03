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
import type { SettingsViewerView } from "#state";
import { useTRPC } from "./trpc.ts";

/** The narrow viewer projection a settings `when` predicate consumes. The React Compiler caches the
 *  projection on the derived flags, so it stays stable across unrelated re-renders (D54: manual memo is
 *  banned in compiled files). */
export function useSettingsViewerView(): SettingsViewerView {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.sessions.me.queryOptions());
  const isAdmin = data?.globalRole === "owner" || data?.globalRole === "admin";
  return { isAdmin };
}
