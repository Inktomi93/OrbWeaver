// preset/ front door — the only entry into the preset slice. The composition root mounts
// `<PresetLibraryAnchor><PresetLibrarySurface/></…>` in the `presets` LIST slot, `<PresetEditorSurface>`
// (or `<PresetLibraryWelcome>`) in CONTENT, and the per-view `<PresetReadout>` in the CONTEXT panel —
// all three assembled by `presetsSection`, which is what the registry actually consumes.

export type { PresetLibraryAnchorProps } from "./anchors/preset-library-anchor.tsx";
export { PresetLibraryAnchor } from "./anchors/preset-library-anchor.tsx";
export { PresetLibraryWelcome } from "./components/preset-library-welcome.tsx";
export { PresetReadout } from "./components/readout/preset-readout.tsx";
export { presetsSection } from "./lib/presets-section.tsx";
export type { PresetEditorSurfaceProps } from "./surfaces/preset-editor-surface.tsx";
export { PresetEditorSurface } from "./surfaces/preset-editor-surface.tsx";
export { PresetLibrarySurface } from "./surfaces/preset-library-surface.tsx";
