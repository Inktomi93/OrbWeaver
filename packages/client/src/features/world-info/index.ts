// world-info/ front door (UI-Arch §2.1) — the ONLY entry into the world-info slice (dep-cruiser
// client-feature-front-door). The World Info authoring rail section (§4.1 authoring group). The composition
// root (routes/home-page.tsx) mounts `<WorldInfoLibraryAnchor><WorldInfoLibrarySurface/></…>` in the
// `worldInfo` LIST slot, the `<WorldInfoEditorSurface>` (or the `<WorldInfoWelcome>` teaching state) in
// CONTENT, and `<BookAttachments>` (the global/character/persona activation panel) in the CONTEXT slot.

export type { WorldInfoLibraryAnchorProps } from "./anchors/world-info-library-anchor";
export { WorldInfoLibraryAnchor } from "./anchors/world-info-library-anchor";
export type { BookAttachmentsProps } from "./components/book-attachments";
export { BookAttachments } from "./components/book-attachments";
export { WorldInfoWelcome } from "./components/world-info-welcome";
export type { WorldInfoEditorSurfaceProps } from "./surfaces/world-info-editor-surface";
export { WorldInfoEditorSurface } from "./surfaces/world-info-editor-surface";
export type { WorldInfoLibrarySurfaceProps } from "./surfaces/world-info-library-surface";
export { WorldInfoLibrarySurface } from "./surfaces/world-info-library-surface";
