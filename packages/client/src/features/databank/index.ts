// features/databank — front door (UI-Arch §2.1), the ONLY entry into the databank slice (dep-cruiser
// client-feature-front-door). The DOCUMENTS library: the rail section (D-0 Arm A), its list/detail/
// activation surfaces, the three-mode ingest dialog, and the model layer they all project through.
//
// SCOPE FENCE — this feature owns the OWNER's bank. Two databank-adjacent surfaces deliberately live
// elsewhere and must not migrate here:
//   · the retrieval KNOBS (k / minScore / rerank / the `{{databank}}` slot budget) are a contributed
//     SETTINGS section owned by `features/chat` — chat owns the slot's consumption (the gather op).
//   · the per-chat rack (which documents feed THIS room, and the D85 host visibility toggle) is HOST
//     authority over a room, so it homes in `features/chat` too — a tRPC call is a DATA seam, not a
//     feature import. That surface is the program's next stage, not this one.

// The ingest ceremony as a shell MODAL SLOT — openable from any surface that owns the intent (P1-2).
export { addDocumentModal } from "./lib/add-document-modal.tsx";
export { databankSection } from "./lib/databank-section.tsx";
// The HOME tile (D-7) — a CONTRIBUTION the door assembles, never an import home makes of this feature.
export { databankDocumentsTile } from "./lib/home-documents-tile.tsx";
