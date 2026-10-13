// The production door's registries as CT sees them: re-exported, never re-listed (Spine-Testing §10).
// This is the one test-side import of `compose/` (`client-compose-door-only`); `ct-config-mirror-parity` reads it.
// The boot stamp is a door function, not a registry; a story that exercises it takes it from here too.

export {
  AppDataProviders,
  AuthedProviders,
  browserSessionDocumentHost,
  characterDetailContributors,
  chatSettingsSections,
  chatSurfaceContributors,
  chromeWidgets,
  commandPaletteSources,
  configGroups,
  configSections,
  corpusContextTabs,
  createAuthedComposition,
  createClientRuntime,
  homeTiles,
  makeChatContextContributors,
  makeChatContextRegions,
  modals,
  slashCommands,
  stampAppearanceBootHint,
  toolRenderers,
} from "@orb/client/compose";
