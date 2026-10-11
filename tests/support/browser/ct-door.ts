// The production door's registries as CT sees them: re-exported, never re-listed (Spine-Testing §10).
// This is the one test-side import of `compose/` (`client-compose-door-only`); `ct-config-mirror-parity` reads it.

export { configSections } from "#client/compose/config-sections.ts";
export {
  chatSettingsSections,
  chatSurfaceContributors,
  chromeWidgets,
  commandPaletteSources,
  corpusContextTabs,
  slashCommands,
  toolRenderers,
} from "#client/compose/contributors.ts";
export { homeTiles } from "#client/compose/home-tiles.ts";
