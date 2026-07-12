// domain/hub — FRONT DOOR: the only legal external import. transport consumes the service (searchGifs /
// importGif); the entry root builds the `HubContext` (the injected adapter/credential/assets ops) and calls
// `createHubService`. Cross-boundary wire types live in `@orb/contracts/hub` (§7.4); the domain-internal
// contract shapes are re-exported type-only. v1 is the gif slice (D61 doc 02 §5) — the remote card-hub
// browse verbs + the `HubAdapter` registry land with H2+ (this leaf owns NO tables in v1).

export type { HubContext, HubService, HubServiceDeps } from "./contract/service";
export { createHubService } from "./service";
