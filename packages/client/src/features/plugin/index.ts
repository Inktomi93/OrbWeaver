// features/plugin — the D46 sandbox's client face (interaction-direction-spec §7-C7/§7-C7a). Two surfaces,
// two homes, because they have two scopes: the PLUGINS settings pane (install · grant · enable · update ·
// remove · log — PER-USER and ungated, matching the server's user-scoped verbs, D147: `plugin.list` is the
// caller's own rows and every control acts on a row they own), and the per-room SNIPPET console contributed
// into chat's "This chat" tab (`runSnippet` is chat-scoped).
//
// The front door exports only what the composition root assembles: the pane def and the section def. Every
// component below them is internal — a consumer that wants a plugin surface takes it through the registry
// the door builds, never by importing a component (client-architecture-lockdown.md §8/G8).

// The two SURFACES are exported alongside the defs (the `RulesSection` precedent in features/automation):
// a CT mounts only from a non-test module, and the surfaces are what the rendered proofs of the grant
// screen and the console exercise.

export { SnippetConsole } from "./components/snippet-console.tsx";
// The two U2 CHAT-anchor contributions (plugin-ui-plane #679 seam 7) — assembled into chat's surface + section
// registries at the door, never imported by chat itself.
export { pluginChatFlankSurface, pluginChatSettingsSection, pluginMessageFooterSurface } from "./lib/chat-anchors.tsx";
export { pluginDistributeSection } from "./lib/plugin-distribute-section.tsx";
export { pluginsPane } from "./lib/plugins-pane.tsx";
export { pluginSnippetConsoleSection } from "./lib/snippet-console-section.tsx";
// The U3 TOOL-CARD contribution (plugin-ui-plane #679 seam 7) — one member of chat's `toolRenderers` registry,
// claiming the `plugin_` tool namespace; chat imports nothing from here.
export { pluginToolRenderer } from "./lib/tool-card.tsx";
export { PluginsSettingsSurface } from "./surfaces/plugins-settings-surface.tsx";
