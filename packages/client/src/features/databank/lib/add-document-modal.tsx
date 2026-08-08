// The Add-document modal as ONE co-located definition (client-architecture-lockdown.md §6d) — the
// three-mode ingest ceremony (upload · paste · link) as a shell slot rather than local dialog state.
//
// WHY A SLOT (side-eye 2026-08-08 P1-2): the dialog was `useState` in the Databank band AND in the library
// pane — two homes for one ceremony, and no home at all for a caller on another section. Home's databank
// tile could therefore only navigate: "Add your first document" dropped the user on the library's own
// empty state, which said the same thing again with the real button. A slot makes the ceremony itself the
// destination — `openModal("addDocument")` from anywhere, one opener, one home.
//
// `surface` placement: it has no rail/topbar affordance of its own: it is opened by an explicit call from
// the surfaces that own the intent (the band's Add primary, the pane's empty state, the home tile) — the
// `newChat` posture exactly.

import { Plus } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { AddDocumentBody } from "../components/add-document-body.tsx";

export const addDocumentModal: ModalDefinition = {
  id: "addDocument",
  title: "Add a document",
  trigger: { placement: "surface", label: "Add a document", icon: Plus },
  body: (): ReturnType<typeof AddDocumentBody> => <AddDocumentBody />,
};
