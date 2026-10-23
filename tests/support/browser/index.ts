// The browser door: helpers and production-backed providers component specs run against a mounted story.

export { expectCacheProse } from "./cache-prose.ts";
export { CtAppDataProviders, CtClientProviders, CtConfigGroupBody } from "./ct-data-providers.tsx";
export {
  AppDataProviders,
  characterDetailContributors,
  chatSurfaceContributors,
  chromeWidgets,
  configSections,
  createAuthedComposition,
  createClientRuntime,
  homeTiles,
  toolRenderers,
} from "./ct-door.ts";
export { CtIsolation } from "./ct-isolated-subject.tsx";
export { isolationRegistry } from "./ct-isolation.ts";
export { CtProviders } from "./ct-providers.tsx";
export { pixelContrast, pixelSurface } from "./pixel-contrast.ts";
export { storyTestId } from "./story-test-ids.ts";
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
