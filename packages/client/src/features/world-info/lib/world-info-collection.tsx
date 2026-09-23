// The WORLD INFO collection contribution — the `collection` body of the
// `worldInfo` config group (`world-info-group.tsx` carries the library's identity since the config revamp
// #866 S1), consumed BLIND by `features/config`.
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

import type { CollectionContribution } from "#lib";
import { WorldInfoCollectionRows } from "../components/world-info-collection-rows.tsx";
import { WorldInfoContextBody } from "../components/world-info-context-body.tsx";
import {
  useCreateWorldInfoMember,
  useImportWorldInfoMember,
  useWorldInfoCount,
  useWorldInfoInsights,
  useWorldInfoMemberTitle,
} from "../hooks/use-world-info-collection.ts";
import { WorldInfoMemberSurface } from "../surfaces/world-info-member-surface.tsx";

export const worldInfoCollection: CollectionContribution = {
  emptyText: "No books yet.",
  useCount: useWorldInfoCount,
  // The welcome hero's chip wall (side-eye 2026-08-19 P1-2 — this library used to declare no preview, so its
  // launcher rendered as a hollow shell in the lead column). The rank is ATTACHMENT, named by the kicker.
  insights: { useInsights: useWorldInfoInsights },
  useMemberTitle: useWorldInfoMemberTitle,
  create: { label: "New book", useRun: useCreateWorldInfoMember },
  importFile: { label: "Import a world-info book", accept: "application/json", useRun: useImportWorldInfoMember },
  list: (view) => <WorldInfoCollectionRows view={view} />,
  // The WHOLE view: the editor draws the drill row out of `library` too (#1747, §3.4).
  detail: (view) => <WorldInfoMemberSurface view={view} />,
  // Same question as the regex arm asks, in the same words — one grammar across the workspace's context band.
  context: { kind: "body", title: "Where it fires", render: (view) => <WorldInfoContextBody memberId={view.memberId} /> },
};
