// preset/ front door — the only entry into the preset slice. The composition root mounts
// `<PresetLibraryAnchor><PresetLibrarySurface/></…>` in the `presets` LIST slot, `<PresetEditorSurface>`
// (or `<PresetLibraryWelcome>`) in CONTENT, and `<PresetUsageContext>` in the collapsed CONTEXT panel.

export type { PresetLibraryAnchorProps } from "./anchors/preset-library-anchor";
export { PresetLibraryAnchor } from "./anchors/preset-library-anchor";
export { PresetLibraryWelcome } from "./components/preset-library-welcome";
export { PresetSectionInspector } from "./components/preset-section-inspector";
export type { PresetUsageContextProps } from "./components/preset-usage-context";
export { PresetUsageContext } from "./components/preset-usage-context";
export type { PresetEditorSurfaceProps } from "./surfaces/preset-editor-surface";
export { PresetEditorSurface } from "./surfaces/preset-editor-surface";
export { PresetLibrarySurface } from "./surfaces/preset-library-surface";
