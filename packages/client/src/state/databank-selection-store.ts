// The databank-SELECTION store (UI-Arch §4.2 rule 1: LIST selection drives CONTENT). Holds which document
// the Databank section has open — CONTENT renders its detail surface, else the teaching welcome; the CONTEXT
// activation body reads the same pointer. A PRIMARY-ONLY `createDrillSelectionStore` (G27): a document has
// no sub-drill (there is no folder/collection primitive and the source-text reveal is local render state).
// Not persisted — landing back on the section welcome after a hard reload is fine.

import type { DocumentId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const databankSelection = createDrillSelectionStore<DocumentId>("databank-selection");

// There is deliberately NO bare `select` export: every way into a document is FROM THE LIST (a library-row
// click and the add-dialog's `onCreated`), and databank has no deep-link / agent-nav door the way
// `character` does. The factory arm stays available the day one lands — mirroring the whole factory API
// here just minted an unreachable export.
/** Open a document from the LIST AND close any open LIST slide-over (no-op when the LIST is docked). */
export const selectDocumentFromList = databankSelection.selectFromList;
/** Clear the selection (back to the Databank welcome state) — fired on delete of the open document. */
export const clearDocumentSelection = databankSelection.clear;
/** Reactive: the currently-open document id (`null` = none). A primitive selector (no fresh object). */
export const useSelectedDocumentId = databankSelection.usePrimaryId;
