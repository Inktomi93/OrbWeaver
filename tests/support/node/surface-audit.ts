// Spec-driven audit inputs are shared with Node-side scenario builders without importing browser implementations.
import type { Locator } from "@playwright/test";

const SURFACE_STATES = ["loaded", "empty", "error"] as const;
/** Every product audit collects the full set; a narrower request names its subset from this tuple. */
export const SURFACE_CHECKS = ["names", "forms", "density"] as const;
type SurfaceChecks = readonly [(typeof SURFACE_CHECKS)[number], ...(typeof SURFACE_CHECKS)[number][]];
const SURFACE_ERROR_SOURCES = ["query", "interaction"] as const;
export type SurfaceAuditErrorSource = (typeof SURFACE_ERROR_SOURCES)[number];

interface SurfaceAuditSubject<Checks extends SurfaceChecks> {
  readonly name: string;
  readonly scope: Locator;
  readonly witnesses: readonly [Locator, ...Locator[]];
  readonly checks: Checks;
  readonly requireBothFormKeys?: boolean;
}

export type SurfaceAuditRequest<Checks extends SurfaceChecks = SurfaceChecks> = SurfaceAuditSubject<Checks> &
  (
    | { readonly state: Exclude<(typeof SURFACE_STATES)[number], "error">; readonly errorSource?: never }
    | { readonly state: "error"; readonly errorSource?: SurfaceAuditErrorSource }
  );

/** Requested pane intent does not prescribe the production shell's resolved docking mode. */
export type SurfacePaneRequest =
  | { readonly kind: "desktop"; readonly panes: { readonly list: boolean; readonly context: boolean } }
  | { readonly kind: "mobile"; readonly screen: string };
