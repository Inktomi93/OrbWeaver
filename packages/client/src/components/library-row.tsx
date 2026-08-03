// LibraryRow — the client-shared entity-library row (clone-audit item 2): a `@orb/ui/list-row` whose
// click opens the entity in CONTENT, an optional leading status marker, an optional state toggle, and an
// optional Rename · Duplicate · Delete actions menu (RowActionsMenu, item 1) with its delete-confirm. The
// trailing cluster is the §12.2 grammar in order: state toggle → inline verb → kebab (hard cap, three). Consolidates the near-identical
// preset-library-row ↔ world-info-library-row shells; the per-feature leading marker + delete copy stay
// feature-owned (passed in). character-card intentionally does NOT consume this — its avatar/bulk/collapse/
// chat-CTA anatomy diverges enough that it shares only the RowActionsMenu composite, not the row shell.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — a domain-agnostic composite over ListRow +
// RowActionsMenu, the ConfirmDialog homing precedent).

import { Button } from "@orb/ui/button";
import { Copy, Icon, Pencil } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { RowActionsMenu } from "./row-actions-menu";
import { ROW_REVEAL } from "./row-reveal";

/** The Rename · Duplicate · Delete actions for a library row (omit for a non-actionable row). */
export interface LibraryRowActions {
  /** The entity name — seeds the menu aria-label + the delete-confirm title. */
  readonly name: string;
  /** A per-row DISAMBIGUATOR appended to the action names ('Duplicate "Default (edited)" · 9h ago').
   *  Presets fork from one base, so nine rows share a name and every action label collided; the qualifier is
   *  whatever the row already SHOWS (its edit stamp), so the announced name matches the screen. Omit where
   *  names are unique. The delete-confirm keeps the bare name (a dialog carries its own context). */
  readonly qualifier?: string;
  readonly onRename: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  /** The delete-confirm body — plain text/fragment only (see ConfirmDialog). */
  readonly deleteDescription: ReactNode;
  /** The row's ONE frequent non-navigational verb, surfaced INLINE beside the kebab (§12.2) — a
   *  `ROW_REVEAL` ghost icon (rest hidden, revealed on the row's hover/focus-within, always-on for coarse).
   *  The kebab KEEPS the same item (N3 mirror parity — inline is a shortcut, never the only path).
   *  Omitted ⇒ kebab-only, the world-info posture (books are low-churn; no frequency evidence). */
  readonly inlineVerb?: "duplicate";
  /** Feature-owned `MenuItem`s rendered ABOVE Rename, and BELOW Duplicate (above the destructive Delete).
   *  The kebab retains EVERY action a row offers (N3 mirror parity), so a row carrying an inline state
   *  toggle or a feature-specific verb mirrors it here. Two slots because the §9 kebab order is
   *  `state · Rename · Duplicate · feature verbs · Delete`, and Rename/Duplicate are this composite's own. */
  readonly menuItemsBefore?: ReactNode;
  readonly menuItemsAfter?: ReactNode;
}

export interface LibraryRowProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /**
   * A glyph-scale marker rendered INLINE-LEFT of the name — for a mark that is a property of the NAME
   * rather than a state of the row (the built-in preset's lock: "this one is packaged", not "this one is
   * doing something"). Decorative by construction (`ListRow.leading` is `aria-hidden`), so the row must
   * still say it in words — the built-in's "Built-in default" subtitle is that word.
   * A row STATE belongs in `markers`/`stateToggle` instead, which are in the accessible tree.
   */
  readonly leading?: ReactNode;
  /**
   * Keeps the trailing cluster IN FLOW with its strip permanently RESERVED, instead of floating it out of
   * flow at the row's end. Pass it for a row whose cluster carries a REST-VISIBLE control (a pressed state
   * toggle): the float arm is inert at rest and sits ON the title text, so a rest-visible control there is
   * both unclickable and an overlay. Reserving the strip is also what makes the row's geometry constant —
   * see `ROW_REVEAL_SWAP` for the hit-test oscillation a hover-variable row layout causes.
   *
   * THE VALUE IS THE **LIST'S** WIDEST CLUSTER, not this row's (§12.2 slot count, 1–{@link CLUSTER_SLOTS}).
   * The strip pads to it (`clusterSpacers`) so the state column lands at ONE x on every row even when some
   * rows carry no actions menu (F-4) — that alignment is a property of the LIST, which is why only the list
   * can state it. It used to pad unconditionally to the full three: the regex roster renders exactly one
   * slot per row, so every row reserved two dead boxes and 88px of a 290px row went blank while the script
   * NAMES truncated at 128px (side-eye 2026-08-03 P1).
   *
   * Omit ⇒ the cluster FLOATS (the default; no reservation, no spacers).
   */
  readonly actionsReserved?: number;
  /**
   * Rest-visible STATUS markers (Active / Global / a built-in lock) — rendered on the TITLE LINE, never in
   * the leading slot. A leading status badge is variable-width and only SOME rows have one, so the title
   * column started at a different x on every row and the list lost its scan column (side-eye P2-6). The
   * title-line marker is the chats pane's grammar (★ / ⚔ / Archived); one grammar, one column.
   * Bonus a11y: `ListRow.markers` rides the row's `aria-describedby`, while the leading slot is
   * `aria-hidden` — the status was silent for a screen reader until it moved here.
   */
  readonly markers?: ReactNode;
  /**
   * The row's ONE state toggle (`RowToggleAction`), rendered FIRST in the trailing cluster (§12.2 slot 1).
   * Independent of `actions`: a row with no CRUD menu can still carry state (the built-in preset is
   * activatable but neither renameable nor deletable). It rides the FLOATED cluster, so it must be
   * reveal-gated at rest (`rest="never"`) with its pressed state shown in `markers` — a rest-VISIBLE control
   * inside the float arm is inert and sits on the title text (`listRowVariants.float`).
   */
  readonly stateToggle?: ReactNode;
  /** The trailing actions menu. Omit for a row that can't be renamed/duplicated/deleted (e.g. a built-in). */
  readonly actions?: LibraryRowActions;
}

/** The §12.2 cluster's HARD CAP — state toggle · inline verb · kebab. It is a property of this composite
 *  (the header states it), which is what lets a reserved strip be padded to a constant width without any
 *  row needing to know what its peers render. */
const CLUSTER_SLOTS = 3;

/**
 * Pads a RESERVED cluster out to the LIST's declared slot count, TRAILING (side-eye F-4).
 *
 * The defect: `actionsReserved` keeps the cluster in flow but reserves only what the row itself renders, so
 * a built-in row whose cluster is `[radio]` right-aligned its radio at x=312 while every fork row's
 * `[radio, duplicate, kebab]` put the same radio at x=232 — the one-of-N state column staggered 80px row to
 * row, visible at rest, in a list you scan precisely to find which row is active.
 *
 * TRAILING, not leading, is the whole point: slot 1 is then always the state toggle, at one x, on every row.
 * Padding the other end would straighten the kebab column instead — the column nobody scans.
 *
 * `size-control-md` is the `size="icon"` Button box BY TOKEN, so the reservation cannot drift from the
 * control it reserves. `aria-hidden` and empty: this is layout, never a disabled affordance (a spacer that
 * reached the a11y tree would announce three phantom controls per built-in row).
 */
function clusterSpacers(rendered: number, reserved: number): readonly ReactElement[] {
  return Array.from({ length: Math.max(0, Math.min(reserved, CLUSTER_SLOTS) - rendered) }, (_unused, at) => (
    <Row aria-hidden={true} className="size-control-md shrink-0" data-slot="library-row-cluster-spacer" key={`cluster-spacer-${String(at)}`} />
  ));
}

/** One entity-library row: title/subtitle + title-line status markers · state toggle · Rename/Duplicate/
 *  Delete menu. */
export function LibraryRow({ title, subtitle, selected, onSelect, markers, leading, stateToggle, actions, actionsReserved }: LibraryRowProps): ReactElement {
  const reserved = actionsReserved !== undefined;
  const hasCluster = stateToggle !== undefined || actions !== undefined;
  // What this row actually renders into the §12.2 cluster: the toggle, the optional inline verb, the kebab.
  const renderedSlots = (stateToggle === undefined ? 0 : 1) + (actions === undefined ? 0 : (actions.inlineVerb === undefined ? 0 : 1) + 1);
  return (
    <ListRow
      // `group` roots the row so an inline verb's ROW_REVEAL fires on row hover/focus-within (§12.2).
      className="group"
      // Default: every trailing control is hover-revealed, so the cluster floats at the row's end instead of
      // reserving ~76px of the title column at rest (side-eye P1-2b). `actionsReserved` opts out for a row
      // that shows a control at rest — see the prop.
      actionsFloat={!reserved}
      // A reserved strip is a SIBLING of the body, so the row's tint has to be painted on the root or the
      // highlight stops before the controls (and the cluster ends up minting its own panel to compensate —
      // the box-in-box the reserved arm exists to kill).
      rowTint={reserved ? "row" : "body"}
      clickable={true}
      onClick={onSelect}
      selected={selected}
      title={title}
      {...(leading === undefined ? {} : { leading })}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(markers === undefined ? {} : { markers })}
      {...(hasCluster
        ? {
            actions: (
              <>
                {stateToggle}
                {actions === undefined ? null : <LibraryRowActionsMenu {...actions} />}
                {/* Only the RESERVED arm pads: a FLOATED cluster is out of flow at the row's end and
                    reserves nothing, so spacers there would be dead boxes hovering over the title text. */}
                {actionsReserved === undefined ? null : clusterSpacers(renderedSlots, actionsReserved)}
              </>
            ),
          }
        : {})}
    />
  );
}

/** The subject an action label names — the row's name, disambiguated by what the row already shows. */
function actionSubject(name: string, qualifier: string | undefined): string {
  return qualifier === undefined ? name : `"${name}" · ${qualifier}`;
}

function LibraryRowActionsMenu({
  name,
  qualifier,
  onRename,
  onDuplicate,
  onDelete,
  deleteDescription,
  inlineVerb,
  menuItemsBefore,
  menuItemsAfter,
}: LibraryRowActions): ReactElement {
  const subject = actionSubject(name, qualifier);
  return (
    <>
      {inlineVerb === undefined ? null : (
        <Button aria-label={`Duplicate ${subject}`} className={ROW_REVEAL} intent="ghost" onClick={onDuplicate} size="icon" type="button">
          <Icon icon={Copy} size="sm" />
        </Button>
      )}
      <LibraryRowMenu
        deleteDescription={deleteDescription}
        name={name}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onRename={onRename}
        {...(qualifier === undefined ? {} : { qualifier })}
        {...(menuItemsBefore === undefined ? {} : { menuItemsBefore })}
        {...(menuItemsAfter === undefined ? {} : { menuItemsAfter })}
      />
    </>
  );
}

/** The ⋯ overflow — it retains EVERY action including an inlined one (N3 mirror parity), and is the ONLY
 *  home for the destructive Delete + the dialog-opening Rename. §12.2 rest posture: it RIDES the reveal
 *  like every other row affordance (hidden at rest, hover/focus-within/coarse revealed) and sits in the
 *  `size-control-md` icon box the grammar's touch math assumes — a 40×32 `sm` box was the odd one out. */
function LibraryRowMenu({
  name,
  qualifier,
  onRename,
  onDuplicate,
  onDelete,
  deleteDescription,
  menuItemsBefore,
  menuItemsAfter,
}: Omit<LibraryRowActions, "inlineVerb">): ReactElement {
  return (
    <RowActionsMenu
      label={`Actions for ${actionSubject(name, qualifier)}`}
      reveal={true}
      triggerSize="icon"
      destructive={{
        separator: false,
        title: `Delete "${name}"?`,
        description: deleteDescription,
        onConfirm: onDelete,
      }}
    >
      {menuItemsBefore}
      <MenuItem onClick={onRename}>
        <Icon icon={Pencil} size="sm" />
        Rename
      </MenuItem>
      <MenuItem onClick={onDuplicate}>
        <Icon icon={Copy} size="sm" />
        Duplicate
      </MenuItem>
      {menuItemsAfter}
    </RowActionsMenu>
  );
}
