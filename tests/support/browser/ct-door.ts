// The production door's registries as CT sees them: re-exported, never re-listed (Spine-Testing §9).
// This is the one test-side import of `compose/`, enforced by the client-compose-door-only dependency rule.

export {
  AppDataProviders,
  AuthedProviders,
  browserSessionDocumentHost,
  characterDetailContributors,
  chatSurfaceContributors,
  configSections,
  createAuthedComposition,
  createClientRuntime,
  toolRenderers,
} from "@orb/client/compose";
