// The router-level pending affordance (FINAL-Auth-Modes §7 P0 — P1-b fix). Every route's `beforeLoad`
// AWAITS the auth guard (`/me`) before the component mounts, so a slow/hanging `/api/auth/me` would show
// a BLANK page — the login surface's own `isPending` skeleton never gets a chance to mount (it lives
// inside a component that hasn't rendered yet). This is the brand loading mark the router paints during
// that window instead (wired as `defaultPendingComponent`), killing the blank-page gap. The Weave glyph
// in a loading state is a sanctioned single-glyph use (UI-Arch §4.3 — the restraint rule allows it in
// empty/loading states); `prefers-reduced-motion` freezes the shimmer to a static mark (ui globals.css).

import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { WeaveGlyph } from "#lib";

/** Full-viewport brand loading mark — shown while a route's `beforeLoad` auth gate resolves. */
export function RoutePending(): ReactElement {
  return (
    <Stack align="center" justify="center" className="min-h-dvh bg-background text-foreground" role="status" aria-label="Loading">
      <WeaveGlyph size={64} anim={true} />
    </Stack>
  );
}
