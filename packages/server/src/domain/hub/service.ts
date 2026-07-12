// domain/hub — COMPOSITION ROOT: wires the gif verbs over the injected `HubContext` (ZERO logic of its
// own — see contract/service.ts for the leaf's surface, the injected-op types, and the D61 gif-slice scope).
// v1 = search + import (doc 02 §5); card-hub verbs (search/preview/import-card) land with H2+.

import { createHubContext } from "./context";
import type { HubService, HubServiceDeps } from "./contract/service";
import { createGifs } from "./verbs/gifs";

export function createHubService(deps: HubServiceDeps): HubService {
  const ctx = createHubContext(deps);
  return {
    ...createGifs(ctx),
  };
}
