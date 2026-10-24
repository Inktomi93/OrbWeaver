// The door's registry lists, for the one importer outside the door: the browser test kit, so CT mounts the
// registries that ship (`client-compose-door-only`, Spine-Testing §9). The door's own halves import the
// sibling files directly; the authed assembly stays behind the `/` route's lazy boundary.

export { AppDataProviders } from "./app-data-providers.tsx";
export { createAuthedComposition } from "./authed-composition.tsx";
export { AuthedProviders } from "./authed-providers.tsx";
export { characterDetailContributors } from "./chat-context.ts";
export { browserSessionDocumentHost, createClientRuntime } from "./client-runtime.ts";
export { configSections } from "./config-sections.ts";
export { chatSurfaceContributors, toolRenderers } from "./contributors.ts";
