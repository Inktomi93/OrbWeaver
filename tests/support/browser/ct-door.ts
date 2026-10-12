// The production door's registries as CT sees them: re-exported, never re-listed (Spine-Testing §10).
// This is the one test-side import of `compose/` (`client-compose-door-only`); `ct-config-mirror-parity` reads it.
// The boot stamp is a door function, not a registry; a story that exercises it takes it from here too.

export {
  characterDetailContributors,
  chatSettingsSections,
  chatSurfaceContributors,
  chromeWidgets,
  commandPaletteSources,
  configSections,
  corpusContextTabs,
  homeTiles,
  makeChatContextContributors,
  makeChatContextRegions,
  slashCommands,
  stampAppearanceBootHint,
  toolRenderers,
} from "@orb/client/compose";
