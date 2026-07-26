// world-info/ front door (UI-Arch §2.1) — the ONLY entry into the world-info slice (dep-cruiser
// client-feature-front-door). The World Info authoring rail section (§4.1 authoring group) is ONE
// co-located `SectionDefinition` (`lib/world-info-section.tsx`, client-architecture-lockdown.md §6a),
// assembled into the section registry at the composition root (main.tsx) — the LIST slot mounts
// `<WorldInfoLibraryAnchor><WorldInfoLibrarySurface/></…>`, CONTENT mounts `<WorldInfoContent>`, and
// CONTEXT mounts `<WorldInfoContextBody>` (the global/character/persona activation panel).

export type { WorldInfoLibraryAnchorProps } from "./anchors/world-info-library-anchor";
export { WorldInfoLibraryAnchor } from "./anchors/world-info-library-anchor";
export type { BookAttachmentsProps } from "./components/book-attachments";
export { BookAttachments } from "./components/book-attachments";
export { WorldInfoWelcome } from "./components/world-info-welcome";
export { worldInfoSection } from "./lib/world-info-section";
export { worldInfoSettingsSection } from "./lib/world-info-settings-section";
export type { WorldInfoEditorSurfaceProps } from "./surfaces/world-info-editor-surface";
export { WorldInfoEditorSurface } from "./surfaces/world-info-editor-surface";
export type { WorldInfoLibrarySurfaceProps } from "./surfaces/world-info-library-surface";
export { WorldInfoLibrarySurface } from "./surfaces/world-info-library-surface";
