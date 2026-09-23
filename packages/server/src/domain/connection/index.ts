// domain/connection — FRONT DOOR: the only legal external import (domain-feature-front-door). Re-exports the
// public surface: the service factory + its contract, the runtime PORTS the composition root hands
// `createInferenceRuntime`, the verb param/result shapes, the typed errors and the local-light seed. The
// cross-boundary types (`UserConnection`, `ConnectionBinding`, `ResolvedConnectionView`, `Task`, …) live in
// `@orb/contracts/inference`; callers import them from there directly, NOT through this door.

export type { ConnectionContext } from "./context.ts";
export { ConnectionNotFoundError } from "./contract/errors.ts";
export type {
  BindingActorInput,
  ConnectionDiagnosticParams,
  ConnectionFields,
  CreateConnectionParams,
  DraftCatalogModelsParams,
  LocalLightSeedDeps,
  RefreshCatalogParams,
  ResolveChatCapabilityParams,
  ResolveTaskParams,
  SetBindingParams,
  UpdateConnectionParams,
} from "./contract/params.ts";
export type { BindingView, CatalogRefreshOutcome, ConnectionCapabilityView, ConnectionView } from "./contract/results.ts";
export type { ConnectionPorts, ConnectionService, ConnectionWorkloadDeps, EndpointAdmission } from "./contract/service.ts";
export { seedLocalLightConnections } from "./persistence/local-light-seed.ts";
export { createConnectionPorts } from "./persistence/ports.ts";
export { createConnectionService } from "./service.ts";
export { toResolvedView } from "./substrate/resolved-view.ts";
export { createConnectionWorkloadContributions } from "./workload-contributions.ts";
