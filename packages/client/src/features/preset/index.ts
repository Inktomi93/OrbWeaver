// preset/ front door — the only entry into the preset slice. The composition root mounts
// `<PresetLibraryAnchor><PresetLibrarySurface/></…>` in the `presets` LIST slot, `<PresetEditorSurface>`
// (or `<PresetLibraryWelcome>`) in CONTENT, and the per-view `<PresetReadout>` in the CONTEXT panel —
// all three assembled by `presetsSection`, which is what the registry actually consumes.

export type { PresetLibraryAnchorProps } from "./anchors/preset-library-anchor";
export { PresetLibraryAnchor } from "./anchors/preset-library-anchor";
export { PresetLibraryWelcome } from "./components/preset-library-welcome";
export { PresetReadout } from "./components/readout/preset-readout";
export { presetsSection } from "./lib/presets-section";
export type { PresetEditorSurfaceProps } from "./surfaces/preset-editor-surface";
export { PresetEditorSurface } from "./surfaces/preset-editor-surface";
export { PresetLibrarySurface } from "./surfaces/preset-library-surface";
