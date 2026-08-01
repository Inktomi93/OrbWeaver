// LibraryRow — the client-shared entity-library row (clone-audit item 2): a `@orb/ui/list-row` whose
// click opens the entity in CONTENT, an optional leading status marker, and an optional Rename · Duplicate
// · Delete actions menu (RowActionsMenu, item 1) with its delete-confirm. Consolidates the near-identical
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
}

export interface LibraryRowProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** Leading slot — a status badge (Active/Global) or a lock glyph. */
  readonly leading?: ReactNode;
  /** The trailing actions menu. Omit for a row that can't be renamed/duplicated/deleted (e.g. a built-in). */
  readonly actions?: LibraryRowActions;
}

/** One entity-library row: leading marker · title/subtitle · Rename/Duplicate/Delete menu. */
export function LibraryRow({ title, subtitle, selected, onSelect, leading, actions }: LibraryRowProps): ReactElement {
  return (
    <ListRow
      // `group` roots the row so an inline verb's ROW_REVEAL fires on row hover/focus-within (§12.2).
      className="group"
      clickable={true}
      onClick={onSelect}
      selected={selected}
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(leading === undefined ? {} : { leading })}
      {...(actions === undefined ? {} : { actions: <LibraryRowActionsMenu {...actions} /> })}
    />
  );
}

function LibraryRowActionsMenu({ name, onRename, onDuplicate, onDelete, deleteDescription, inlineVerb }: LibraryRowActions): ReactElement {
  return (
    <>
      {inlineVerb === undefined ? null : (
        <Button aria-label={`Duplicate ${name}`} className={ROW_REVEAL} intent="ghost" onClick={onDuplicate} size="icon" type="button">
          <Icon icon={Copy} size="sm" />
        </Button>
      )}
      <LibraryRowMenu deleteDescription={deleteDescription} name={name} onDelete={onDelete} onDuplicate={onDuplicate} onRename={onRename} />
    </>
  );
}

/** The ⋯ overflow — it retains EVERY action including an inlined one (N3 mirror parity), and is the ONLY
 *  home for the destructive Delete + the dialog-opening Rename. */
function LibraryRowMenu({ name, onRename, onDuplicate, onDelete, deleteDescription }: Omit<LibraryRowActions, "inlineVerb">): ReactElement {
  return (
    <RowActionsMenu
      label={`Actions for ${name}`}
      triggerSize="sm"
      destructive={{
        separator: false,
        title: `Delete "${name}"?`,
        description: deleteDescription,
        onConfirm: onDelete,
      }}
    >
      <MenuItem onClick={onRename}>
        <Icon icon={Pencil} size="sm" />
        Rename
      </MenuItem>
      <MenuItem onClick={onDuplicate}>
        <Icon icon={Copy} size="sm" />
        Duplicate
      </MenuItem>
    </RowActionsMenu>
  );
}
