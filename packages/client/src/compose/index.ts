// The door's registry lists, for the one importer outside the door: the browser test kit, so CT mounts the
// registries that ship (`client-compose-door-only`, Spine-Testing §10). The door's own halves import the
// sibling files directly; the authed assembly stays behind the `/` route's lazy boundary.

export { AppDataProviders } from "./app-data-providers.tsx";
export { configGroups, createAuthedComposition, modals } from "./authed-composition.tsx";
export { AuthedProviders } from "./authed-providers.tsx";
export { characterDetailContributors, makeChatContextContributors, makeChatContextRegions } from "./chat-context.ts";
export { browserSessionDocumentHost, createClientRuntime } from "./client-runtime.ts";
export { configSections } from "./config-sections.ts";
export {
  chatSettingsSections,
  chatSurfaceContributors,
  chromeWidgets,
  commandPaletteSources,
  corpusContextTabs,
  slashCommands,
  toolRenderers,
} from "./contributors.ts";
export { homeTiles } from "./home-tiles.ts";
// The boot stamp is a door function, not a registry; a story that exercises it takes it from the kit too.
export { stampAppearanceBootHint } from "./stamp-appearance-boot-hint.ts";
