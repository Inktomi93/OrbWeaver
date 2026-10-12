// The production door's registries as CT sees them: re-exported, never re-listed (Spine-Testing §10).
// This is the one test-side import of `compose/` (`client-compose-door-only`); `ct-config-mirror-parity` reads it.

export {
  chatSettingsSections,
  chatSurfaceContributors,
  chromeWidgets,
  commandPaletteSources,
  configSections,
  corpusContextTabs,
  homeTiles,
  slashCommands,
  toolRenderers,
} from "@orb/client/compose";
