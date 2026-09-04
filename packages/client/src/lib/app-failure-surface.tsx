// THE FAILURE-SURFACE DECLARE — the app saying, in the DOM, that what is on screen is NOT one of its
// surfaces. Two renders qualify and they are the only two: the router's not-found boundary
// (`routes/__root.tsx`) and the app-level crash fallback (`main.tsx`).
//
// WHY IT EXISTS (#1081, measured 2026-09-01 through the real CLI against the dev stack): the design-audit scan of
// /__no-such-route__` printed a full 48-row POPULATION table, filed a `landmark-missing` P2 against the
// not-found boundary and exited 0 — a clean verdict over a page that is the app's way of saying there is
// nothing here. Every zero-hygiene arm the instrument owns is structurally blind to it: the route RESOLVED,
// so `data-app-ready` went up and `readinessGap` passes; the census was 11, not 0, so `censusGap` passes;
// one control was reached, so `reachGap` passes. The discriminator cannot be a node count, and it must not
// be a heuristic over rendered copy — it has to be the app DECLARING the surface, exactly the way
// `data-app-ready` declares that the app mounted (`lib/app-ready-signal.ts`).
//
// THE READER is `tooling/src/ui-audit` (`lib/evidence.ts` `failureSurfaceGap`, read at the page seam in
// `ops/page-validate.ts`), which turns the presence of this attribute into an INSTRUMENT ERROR: no
// population table, no findings, no verdict. `tests/e2e/smoke.spec.ts` pins the stamp on the real
// not-found surface, so the two halves cannot drift apart silently.
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

/** The failure surfaces the app can render instead of a surface. The VALUE is what the instrument prints,
 *  so it is the operator's vocabulary, not an internal one. */
const APP_FAILURE_KINDS = ["not-found", "crashed"] as const;
export type AppFailureKind = (typeof APP_FAILURE_KINDS)[number];

export interface AppFailureSurfaceProps {
  /** Which failure this render is — stamped as `data-app-failure` on the surface root. */
  readonly kind: AppFailureKind;
  /** The failure's own copy (a heading + text, or an EmptyState). */
  readonly children: ReactNode;
}

/**
 * The full-viewport failure shell both fallbacks render, carrying the declare.
 *
 * The attribute sits on the RENDERED ROOT rather than on `<html>` so it appears and disappears with the
 * render itself: a boundary that unmounts (a recovered navigation) takes its declare with it, with no
 * effect to clean up and no window in which the document claims a failure it is no longer showing.
 */
export function AppFailureSurface({ kind, children }: AppFailureSurfaceProps): ReactElement {
  return (
    <Stack align="center" justify="center" gap="block" data-app-failure={kind} className="min-h-dvh bg-background text-foreground">
      {children}
    </Stack>
  );
}
