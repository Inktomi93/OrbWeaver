// domain/hub — the ctx BUILDER: assembles `HubContext` (the injected op bundle) for the verbs to close
// over. v1 has no db handle and no clock — the leaf owns NO tables (browse state is ephemeral; the gif
// import writes the EXISTING assets/gallery via injected ops), so the context is exactly the op bundle the
// entry root wires. The bundle's TYPE is the explicit interface in `contract/service.ts` (no `ReturnType<>`
// — `no-context-returntype`).

import type { HubContext, HubServiceDeps } from "./contract/service";

export function createHubContext(deps: HubServiceDeps): HubContext {
  return deps;
}
