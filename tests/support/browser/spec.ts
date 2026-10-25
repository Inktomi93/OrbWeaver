// The spec door: Node-side helpers a component spec drives the page with; nothing here loads client modules.

export type { NameFinding } from "./accessible-names.ts";
export { formatFindings, nameQualityFindings, productNameFindings, unnamedLandmarkElementFindings } from "./accessible-names.ts";
export { expectCacheProse } from "./cache-prose.ts";
export { formatFormIdentityFindings, formIdentityFindings } from "./form-identity.ts";
export { pixelContrast, pixelSurface } from "./pixel-contrast.ts";
export { settleSurface } from "./settle-surface.ts";
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
