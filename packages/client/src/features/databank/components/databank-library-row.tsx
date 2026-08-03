// One document row in the Databank LIST — a shared `LibraryRow` (§13.2 entity row → RowActionsMenu).
// Clicking it opens the document in CONTENT. The §12.2 trailing grammar, spent exactly as
// databank-surface-spec §6.1 rules it:
//
//   state toggle → EVERYWHERE (the global attach). The one boolean a user scans a document list for, and
//                  OWNER authority, so it belongs on the document — per-chat attach is HOST authority and
//                  lives in the chat panel (the write lives where the authority lives, §2.1).
//   inline verb  → NONE. There is no measured-frequent non-navigational verb for a document (contrast
//                  presets' Duplicate, whose receipt was nine same-named fork rows). §12.2's cap ALLOWS a
//                  third slot; this row deliberately does not spend it.
//   kebab        → Everywhere (the N3 mirror-parity item) · Rename · Reindex · Delete (destructive, behind
//                  the `ConfirmDialog` LibraryRow owns) — the §9 order `state · Rename · Duplicate ·
//                  feature verbs · Delete`, with Duplicate ABSENT: a document has no copy verb (no server
//                  verb exists, and re-uploading the same bytes dedups on `importHash`), so the composite's
//                  optional `onDuplicate` is omitted rather than aimed at something else.
//
// LEADING IS EMPTY, AND THE PHASE CHIP IS CONDITIONAL (§6.1's ruling, which came out of drawing it):
// legacy rendered a phase Badge in the LEADING slot of EVERY row, `Ready` included — at the real 320px pane
// floor that is chrome on six of seven rows carrying zero information (the steady state IS ready) while
// eating the title to an ellipsis. `showsPhaseChip` gates it to `Queued`/`Indexing`/`Empty`; Ready is the
// ABSENCE of a chip. The derived phase itself is legacy's, unchanged.
//
// The chip rides the HEAD OF THE SUBTITLE LINE, exactly as the mock draws it — through `subtitleLead`, the
// `ListRow` slot this lane minted for it. The first build put it in `markers` (the TITLE line, the landed
// home for a rest-visible status since side-eye P2-6 moved marks off the leading slot); the rendered receipt
// at the real 320px pane floor showed that reproducing the very defect §6.1 exists to prevent — the chip ate
// the name on exactly the rows that carry one ("Duskwater B…"). The subtitle line has the slack. It renders
// INSIDE the subtitle's own span, so its text rides the row's `aria-describedby` and the phase is spoken.

import type { DocumentView } from "@orb/contracts/databank";
import type { DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Globe, Icon, RefreshCw } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { LibraryRow, RowToggleAction } from "#components";
import { documentSubtitle, ingestBadge, ingestPhase, showsPhaseChip } from "../lib/databank-model";

export interface DatabankLibraryRowProps {
  readonly document: DocumentView;
  readonly selected: boolean;
  /** Does this document feed EVERY chat (`databank.listGlobal`'s id set, D-1)? */
  readonly global: boolean;
  readonly onSelect: (id: DocumentId) => void;
  readonly onRename: (id: DocumentId) => void;
  readonly onReindex: (id: DocumentId) => void;
  readonly onDelete: (id: DocumentId) => void;
  /** Flip the global attach — the surface owns which of the two mutations that means. */
  readonly onToggleGlobal: (id: DocumentId, next: boolean) => void;
}

export function DatabankLibraryRow({
  document,
  selected,
  global,
  onSelect,
  onRename,
  onReindex,
  onDelete,
  onToggleGlobal,
}: DatabankLibraryRowProps): ReactElement {
  const phase = ingestPhase(document);
  const badge = ingestBadge(phase);
  // ONE pair of names for both the inline toggle and its kebab mirror, so the two can never drift.
  const everywhereOn = `Stop feeding ${document.name} to every chat`;
  const everywhereOff = `Feed ${document.name} to every chat`;
  const toggleGlobal = (): void => onToggleGlobal(document.id, !global);

  return (
    <LibraryRow
      // The pressed Everywhere globe is REST-VISIBLE (D11 `when-on`), so the cluster stays in flow: a
      // rest-visible control inside the floated arm is inert and sits on top of the title text.
      // The LIST's §12.2 slot count (numeric since the nightly fix-all): every databank row renders the same
      // cluster — the rest-visible Everywhere globe + the kebab — so the globe sits at ONE x on every row.
      actionsReserved={2}
      actions={{
        name: document.name,
        onRename: (): void => onRename(document.id),
        onDelete: (): void => onDelete(document.id),
        deleteDescription: "Its indexed passages stop feeding every chat and character it reaches. This cannot be undone from here.",
        // N3 mirror parity: the kebab retains EVERY action the row offers, including the inline state
        // toggle — the inline control is a shortcut, never the only path (and on a coarse pointer the
        // kebab is the reachable one).
        menuItemsBefore: (
          <MenuItem onClick={toggleGlobal}>
            <Icon icon={Globe} size="sm" />
            {global ? "Stop feeding every chat" : "Feed every chat"}
          </MenuItem>
        ),
        menuItemsAfter: (
          <MenuItem onClick={(): void => onReindex(document.id)}>
            <Icon icon={RefreshCw} size="sm" />
            Reindex
          </MenuItem>
        ),
      }}
      onSelect={(): void => onSelect(document.id)}
      selected={selected}
      stateToggle={
        <RowToggleAction
          // `Globe` is a multi-path outline and is deliberately NOT in the fillable seal, so this toggle
          // never fills. Its rest delta is PRESENCE, not hue: at `when-on` an un-global row renders no globe
          // at all until the row is hovered / focused within.
          icon={Globe}
          labelOff={everywhereOff}
          labelOn={everywhereOn}
          onToggle={toggleGlobal}
          pressed={global}
          pressedClassName="text-primary"
          rest="when-on"
        />
      }
      subtitle={documentSubtitle(document)}
      title={document.name}
      {...(showsPhaseChip(phase)
        ? {
            // `size="inline"` is the IN-FLOW arm (side-eye F-6): the chip sits inside a run of text, so a
            // padded `sm` box would build a 28px box inside a 20px line — it would shove the row's two
            // lines apart and eat the scent text it precedes. Inline keeps the tone (the whole point of a
            // chip over a word) at zero line-box cost.
            subtitleLead: (
              <Badge className="mr-field" intent={badge.intent} size="inline" tone="soft">
                {badge.label}
              </Badge>
            ),
          }
        : {})}
    />
  );
}
