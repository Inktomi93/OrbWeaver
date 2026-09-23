// features/imagery — front door (UI-Arch §2.1), the ONLY entry into the imagery slice (dep-cruiser
// client-feature-front-door). The chat-facing image surface: the
// `/imagine` slash command and the three content-triggered modals — generate (imagine, with the
// extractPrompt preview), the lightbox detail (provenance + set-as-background), and img2img edit — all
// assembled at `compose/authed-app.tsx` and opened from chat content via #state actions (the imagery-store),
// so this feature never imports chat and chat never imports it.
//
// SCOPE FENCE — this feature owns the chat-image FLOW (generate/edit/set-background/provenance). Two
// imagery-adjacent surfaces deliberately live elsewhere and must not migrate here:
//   · the prompt-template + negative-prompt EDITOR is a contributed SETTINGS section (`imageryTemplatesSection`)
//     owned by `features/chat` — it edits the user's stored prose slots, a settings concern.
//   · the composer's "generate from typed text" button stays in `features/chat` (the composer owns its own
//     tools); `/imagine` is the richer surface (mode + preview) beside it, not a replacement.

// The modal BODIES are exported for CT (the chat-feature precedent) — a story mounts the body directly with
// the imagery-store seeded, so the flow is exercised without driving the whole app-shell ModalHost.
export { ImageDetailBody } from "./components/image-detail-body.tsx";
export { ImageEditBody } from "./components/image-edit-body.tsx";
export { ImagineBody } from "./components/imagine-body.tsx";
export { imageDetailModal } from "./lib/image-detail-modal.tsx";
export { imageEditModal } from "./lib/image-edit-modal.tsx";
export { imagineModal } from "./lib/imagine-modal.tsx";
export { imagerySlashCommands } from "./lib/imagine-slash-command.ts";
