// The door's registry lists, for the one importer outside the door: the browser test kit, so CT mounts the
// registries that ship (`client-compose-door-only`, Spine-Testing §10). The door's own halves import the
// sibling files directly; the authed assembly stays behind the `/` route's lazy boundary.

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
