// The spec door: Node-side helpers a component spec drives the page with; nothing here loads client modules.

export { formatFindings, nameQualityFindings, productNameFindings, unnamedLandmarkElementFindings } from "./accessible-names.ts";
export { actionGroupGeometry } from "./action-group-geometry.ts";
export { expectCacheProse } from "./cache-prose.ts";
export { densityFindings, formatDensityFindings } from "./density-census.ts";
export { formatFormIdentityFindings, formIdentityFindings } from "./form-identity.ts";
export { emulateMedia, releaseEmulatedMedia } from "./media-emulation.ts";
export { pixelContrast, pixelSurface } from "./pixel-contrast.ts";
export { beginReading, scrollIntoReadingMessage, tokenColor } from "./reading-position.ts";
export { settleSurface } from "./settle-surface.ts";
export { dispatchCommandKey, dropOn, persistedOverrides, pixel, resolvedLength, seedShellState, settledBox, shellTracks } from "./shell-drive.ts";
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
