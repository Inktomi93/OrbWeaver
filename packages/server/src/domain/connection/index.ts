// domain/connection — FRONT DOOR: the service, composition factories and consumed public contracts.
// Canonical inference wire shapes are imported directly from @orb/contracts/inference.

export { ConnectionNotFoundError } from "./contract/errors.ts";

export {
  bindingViewSchema,
  catalogRefreshOutcomeSchema,
  connectionCapabilityViewSchema,
} from "./contract/results.ts";
export type {
  ConnectionAssemblyContext as ConnectionContext,
  ConnectionService,
  ConnectionWorkloadDeps,
} from "./contract/service.ts";
export { seedLocalLightConnections } from "./persistence/local-light-seed.ts";
export { createConnectionPorts } from "./persistence/ports.ts";
// The agent-sdk prompt-cache lineage writes (D8), injected into the inference runtime at the composition root.
export { createSessionEntryWriter } from "./persistence/session-entries.ts";
export { createConnectionService } from "./service.ts";
export {} from "./substrate/resolved-view.ts";
export { createLocalLightUserSeed, seedLocalLightAccounts } from "./verbs/local-light-policy.ts";
export { createConnectionWorkloadContributions } from "./workload-contributions.ts";
