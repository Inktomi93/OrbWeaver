// preset/ front door (UI-Arch §2.1) — the ONLY entry into the preset slice (dep-cruiser
// client-feature-front-door). The GENERATION-preset authoring section (W10 · capability-turn-shaping/04
// §W10 — presets are a rail authoring section, not settings; DISTINCT from D61 roster presets). The
// composition root (routes/home-page.tsx) mounts `<PresetLibraryAnchor><PresetLibrarySurface/></…>` in the
// `presets` LIST slot, the `<PresetEditorSurface>` (or the `<PresetLibraryWelcome>` teaching state) in
// CONTENT, and `<PresetUsageContext>` in the collapsed CONTEXT panel. The descriptor-driven params panel
// (render-from-`ModelCapabilityView`, the GATE) is a tab of the editor — never imported directly by the
// route.

export type { PresetLibraryAnchorProps } from "./anchors/preset-library-anchor";
export { PresetLibraryAnchor } from "./anchors/preset-library-anchor";
export { PresetLibraryWelcome } from "./components/preset-library-welcome";
// The Assembly CONTEXT Section-tab body (BUILD-SPEC §3.5) — reads the editor form via the bridge; the
// ROUTE mounts it in the `presets` CONTEXT `section` tab.
export { PresetSectionInspector } from "./components/preset-section-inspector";
export type { PresetUsageContextProps } from "./components/preset-usage-context";
export { PresetUsageContext } from "./components/preset-usage-context";
export type { PresetEditorSurfaceProps } from "./surfaces/preset-editor-surface";
export { PresetEditorSurface } from "./surfaces/preset-editor-surface";
export { PresetLibrarySurface } from "./surfaces/preset-library-surface";
