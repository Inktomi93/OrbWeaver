// Spec-driven audit inputs are shared with Node-side scenario builders without importing browser implementations.
import type { Locator } from "@playwright/test";

const SURFACE_STATES = ["loaded", "empty", "error"] as const;
const SURFACE_CHECKS = ["names", "forms", "density"] as const;
type SurfaceChecks = readonly [(typeof SURFACE_CHECKS)[number], ...(typeof SURFACE_CHECKS)[number][]];

export interface SurfaceAuditRequest<Checks extends SurfaceChecks = SurfaceChecks> {
  readonly name: string;
  readonly scope: Locator;
  readonly state: (typeof SURFACE_STATES)[number];
  readonly witnesses: readonly [Locator, ...Locator[]];
  readonly checks: Checks;
  readonly requireBothFormKeys?: boolean;
}
