// features/plugin — the D46 sandbox's client face (interaction-direction-spec §7-C7/§7-C7a). Two surfaces,
// two homes, because they have two scopes: the PLUGINS settings pane (install · grant · enable · update ·
// remove · log — admin-gated, matching every `plugin.*` management verb's own `can(caller,"admin")`), and
// the per-room SNIPPET console contributed into chat's "This chat" tab (`runSnippet` is chat-scoped).
//
// The front door exports only what the composition root assembles: the pane def and the section def. Every
// component below them is internal — a consumer that wants a plugin surface takes it through the registry
// the door builds, never by importing a component (client-architecture-lockdown.md §8/G8).

// The two SURFACES are exported alongside the defs (the `RulesSection` precedent in features/automation):
// a CT mounts only from a non-test module, and the surfaces are what the rendered proofs of the grant
// screen and the console exercise.

export { SnippetConsole } from "./components/snippet-console.tsx";
export { pluginsPane } from "./lib/plugins-pane.tsx";
export { pluginSnippetConsoleSection } from "./lib/snippet-console-section.tsx";
export { PluginsSettingsSurface } from "./surfaces/plugins-settings-surface.tsx";
