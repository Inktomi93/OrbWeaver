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

/** One entity-library row: title/subtitle + title-line status markers · state toggle · Rename/Duplicate/
 *  Delete menu. */
export function LibraryRow({ title, subtitle, selected, onSelect, markers, stateToggle, actions }: LibraryRowProps): ReactElement {
  const hasCluster = stateToggle !== undefined || actions !== undefined;
  return (
    <ListRow
      // `group` roots the row so an inline verb's ROW_REVEAL fires on row hover/focus-within (§12.2).
      className="group"
      // Every trailing control here is hover-revealed, so the cluster floats at the row's end instead of
      // reserving ~76px of the title column at rest (side-eye P1-2b).
      actionsFloat={true}
      clickable={true}
      onClick={onSelect}
      selected={selected}
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(markers === undefined ? {} : { markers })}
      {...(hasCluster
        ? {
            actions: (
              <>
                {stateToggle}
                {actions === undefined ? null : <LibraryRowActionsMenu {...actions} />}
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
