// The spec door: Node-side helpers a component spec drives the page with; nothing here loads client modules.

export { touchGesture } from "@orb/tooling/floor/browser/touch-gesture";
export type { SurfacePaneRequest } from "../node/surface-audit.ts";
export { accessibilityScan } from "./accessibility-scan.ts";
export { formatFindings, unnamedLandmarkElementFindings } from "./accessible-names.ts";
export { actionGroupGeometry } from "./action-group-geometry.ts";
export { expectCacheProse } from "./cache-prose.ts";
export { formatDensityFindings } from "./density-census.ts";
export { formatFormIdentityFindings } from "./form-identity.ts";
export { emulateMedia, releaseEmulatedMedia } from "./media-emulation.ts";
export { diagnosticTarget } from "./performance-entry.ts";
export { pixelContrast, pixelSurface } from "./pixel-contrast.ts";
export { beginReading, scrollIntoReadingMessage, tokenColor } from "./reading-position.ts";
export { assertSurfaceReady, auditSurface } from "./settle-surface.ts";
export {
  controlledPanel,
  dispatchCommandKey,
  dropOn,
  persistedOverrides,
  pixel,
  resolvedLength,
  seedShellState,
  settledBox,
  shellTracks,
} from "./shell-drive.ts";
export type { SurfaceActionWindow } from "./surface-action.ts";
export { surfaceAction } from "./surface-action.ts";
export type { SurfaceActionGroup } from "./surface-checkpoint.ts";
export { surfaceCheckpoint } from "./surface-checkpoint.ts";
export { readSurfaceDesignAudit } from "./surface-design-audit.ts";
export { publishSurfaceInventory } from "./surface-inventory.ts";
export { markExpectedSurfaceHttpFailure, observeSurfaceSession } from "./surface-session.ts";
export { surfaceTopology } from "./surface-topology.ts";
export { touchTargetFindings } from "./touch-floor.ts";
export type {
  ActorRefInput,
  CompactionIntent,
  DistributiveOmit,
  GroupConfigInput,
  GuidedSteerInput,
  NewConnection,
  ProcedureAt,
  RpgConfigPatch,
  TrackerDefInput,
  TrpcInput,
  TrpcPath,
} from "./trpc-wire.ts";
export type { WebVitalsEmission } from "./web-vitals.ts";
export { drainWebVitals, installWebVitals, readWebVitals, webVitalsInitScript } from "./web-vitals.ts";
