// RowActionsMenu — the client-shared "⋯ trigger → menu items → optional destructive item wired to
// ConfirmDialog" composite (clone-audit item 1). Nine sites hand-assembled this exact anatomy: a ghost
// icon Button MenuTrigger, a MenuPopup of items, and (usually) a bottom destructive item that opens a
// controlled confirm. This composite owns the shell + the destructive item's confirm state so the
// per-site copy shrinks to its DIVERGENT parts: the aria-label, the item list (children), and the
// destructive copy. Non-destructive items stay as `children` (MenuItem/MenuSeparator/MenuSubmenuRoot/
// MenuLinkItem…) because item sets differ wildly per site (submenus, conditional rows, link items).
//
// OWNER RULING: lives client-shared (NOT @orb/ui — ui stays parts-only; the ConfirmDialog precedent).
// A3 (north-star): the trigger rests HIDDEN and hover-reveals ONLY where `reveal` is set — a row that
// showed its ⋯ at rest keeps showing it (do not newly hide a visible cluster).

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon, MoreHorizontal, Trash2 } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";

// A3 hidden-at-rest: rest hidden, revealed on hover/focus-within, always-on for coarse pointers
// (the character-card ROW_REVEAL string, homed here as the one reveal posture for row action clusters).
const ROW_REVEAL =
  "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

/** The optional destructive menu item + its ConfirmDialog (state owned by RowActionsMenu). */
export interface RowDestructiveAction {
  /** The menu item label. @defaultValue "Delete" */
  readonly label?: string;
  /** The menu item glyph. @defaultValue Trash2 */
  readonly icon?: LucideIcon;
  /** The confirm dialog heading. */
  readonly title: ReactNode;
  /** The confirm dialog body — plain text/fragment only (see ConfirmDialog). */
  readonly description: ReactNode;
  /** The confirm button's label. @defaultValue the item `label` (or "Delete"). */
  readonly confirmLabel?: string;
  /** Fires on confirm. */
  readonly onConfirm: () => void;
  /** Render a MenuSeparator before the destructive item. @defaultValue true */
  readonly separator?: boolean;
}

export interface RowActionsMenuProps {
  /** Accessible name for the ⋯ trigger button. */
  readonly label: string;
  /** The non-destructive menu items. */
  readonly children?: ReactNode;
  /** The trigger glyph. @defaultValue MoreHorizontal */
  readonly icon?: LucideIcon;
  /** Popup alignment. @defaultValue "end" */
  readonly align?: "center" | "end" | "start";
  /** Trigger button size. @defaultValue "icon" */
  readonly triggerSize?: "icon" | "sm";
  /** A3 hover-reveal on the trigger (rest hidden). @defaultValue false — pass true only where the row already hid its cluster. */
  readonly reveal?: boolean;
  /** The bottom destructive item + its confirm dialog. Omit for a menu with no destructive action. */
  readonly destructive?: RowDestructiveAction;
}

/**
 * The one row/entity actions menu — ghost ⋯ trigger, a popup of `children` items, and an optional
 * destructive item wired to a ConfirmDialog whose open-state this composite owns. Non-destructive
 * items are `children`; the destructive item is declarative (`destructive`).
 */
export function RowActionsMenu({
  label,
  children,
  icon = MoreHorizontal,
  align = "end",
  triggerSize = "icon",
  reveal = false,
  destructive,
}: RowActionsMenuProps): ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const destructiveLabel = destructive?.label ?? "Delete";

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              aria-label={label}
              intent="ghost"
              size={triggerSize}
              {...(reveal ? { className: ROW_REVEAL } : {})}
            >
              <Icon icon={icon} size="sm" />
            </Button>
          }
        />
        <MenuPopup align={align}>
          {children}
          {destructive === undefined ? null : (
            <>
              {destructive.separator === false ? null : <MenuSeparator />}
              <MenuItem onClick={(): void => setConfirmOpen(true)}>
                <Icon icon={destructive.icon ?? Trash2} size="sm" />
                {destructiveLabel}
              </MenuItem>
            </>
          )}
        </MenuPopup>
      </Menu>

      {destructive === undefined ? null : (
        <ConfirmDialog
          confirmLabel={destructive.confirmLabel ?? destructiveLabel}
          description={destructive.description}
          onConfirm={destructive.onConfirm}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title={destructive.title}
        />
      )}
    </>
  );
}
