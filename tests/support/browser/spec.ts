// The spec door: Node-side helpers a component spec drives the page with; nothing here loads client modules.

export { expectCacheProse } from "./cache-prose.ts";
export { pixelContrast, pixelSurface } from "./pixel-contrast.ts";
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
