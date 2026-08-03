// The WORLD INFO collection contribution (config-rail-spec.md R2 · review §4) — co-located with its owner,
// assembled at the door into the `config-collections` registry, consumed BLIND by `features/config`.
//
// It replaces the World Info RAIL SECTION: a books LIBRARY is workspace anatomy, not a top-level destination,
// and the rail's authoring run had two library sections (World Info, Presets) competing with the workspace
// that exists to hold exactly this. The section's SECTION_IDS row, its definition, its list surface and its
// band die in the same commit; the editor and the attachment panel are re-homed VERBATIM as `detail` and
// `context` (framed, never redesigned).
//
// `context: {kind:"body"}` — unlike a tag, a book has a real attachment story to manage (global · personas ·
// characters), and that panel IS the reason the section had a CONTEXT pane at all.
//
// `importFile` — D121-D's `band=Import` half, re-homed onto the group band as DATA the host renders (the
// contract's `importFile` field, added by this stage). EXPORT stays the row's own kebab arm, per-member.

import { BookOpen } from "@orb/ui/icons";
import type { CollectionContribution } from "#lib";
import { WorldInfoCollectionRows } from "../components/world-info-collection-rows.tsx";
import { WorldInfoContextBody } from "../components/world-info-context-body.tsx";
import { useCreateWorldInfoMember, useImportWorldInfoMember, useWorldInfoCount } from "../hooks/use-world-info-collection.ts";
import { WorldInfoMemberSurface } from "../surfaces/world-info-member-surface.tsx";
import { WORLD_INFO_COLLECTION_ID } from "./world-info-model.ts";

export const worldInfoCollection: CollectionContribution = {
  id: WORLD_INFO_COLLECTION_ID,
  label: "World Info",
  icon: BookOpen,
  order: 30,
  blurb: "Keyword-triggered lore your characters draw on — a book fires where you attach it.",
  emptyText: "No books yet.",
  useCount: useWorldInfoCount,
  create: { label: "New book", useRun: useCreateWorldInfoMember },
  importFile: { label: "Import a world-info book", accept: "application/json", useRun: useImportWorldInfoMember },
  list: (view) => <WorldInfoCollectionRows view={view} />,
  detail: (view) => <WorldInfoMemberSurface memberId={view.memberId} />,
  // Same question as the regex arm asks, in the same words — one grammar across the workspace's context band.
  context: { kind: "body", title: "Where it fires", render: (view) => <WorldInfoContextBody memberId={view.memberId} /> },
};
