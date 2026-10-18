// preset/ front door — the only entry into the preset slice. The composition root enters through
// `presetsSection`, which mounts the library anchor and surface in LIST, the editor or the library welcome in
// CONTENT, and the readout in CONTEXT.
export {} from "./anchors/preset-library-anchor.tsx";

export { PresetEditorSurface } from "./components/lazy-preset-editor.tsx";
export {} from "./components/preset-library-welcome.tsx";
export {} from "./components/readout/preset-readout.tsx";
export { presetsSection } from "./lib/presets-section.tsx";
export {} from "./surfaces/preset-library-surface.tsx";
