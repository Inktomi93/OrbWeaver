// The per-theme-row action menu (extracted from theme-picker-surface so the destructive-delete
// <AlertDialog> is legal here — a surface may not render its own modal root, client-structure rule 7;
// a COMPONENT may, the persona-panel-row precedent). Seeds offer only Customize (duplicate-to-edit);
// owned rows offer Edit · Duplicate · Delete, where Delete is confirm-gated (UI-Primitives §13.8 R4 —
// destructive → AlertDialog; mirrors the same-wave persona-row delete). Deleting an authored theme
// (incl. its custom CSS) is unrecoverable, so a misclick under Duplicate must not fire it.

import type { Theme } from "@orb/contracts/theme";
import { Copy, Icon, Pencil } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { RowActionsMenu } from "#components";

export interface ThemeRowMenuProps {
  readonly theme: Theme;
  readonly onCustomize: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/** A theme row's action menu — Delete is AlertDialog-confirmed (destructive, no undo). */
export function ThemeRowMenu({ theme, onCustomize, onEdit, onDelete }: ThemeRowMenuProps): ReactElement {
  return (
    <RowActionsMenu
      label={`${theme.name} actions`}
      triggerSize="sm"
      {...(theme.isSeed
        ? {}
        : {
            destructive: {
              title: "Delete this theme?",
              description: `This permanently deletes “${theme.name}”, including its custom CSS. This can't be undone.`,
              onConfirm: onDelete,
            },
          })}
    >
      {theme.isSeed ? (
        <MenuItem onClick={onCustomize}>
          <Icon icon={Copy} size="sm" />
          Customize
        </MenuItem>
      ) : (
        <>
          <MenuItem onClick={onEdit}>
            <Icon icon={Pencil} size="sm" />
            Edit
          </MenuItem>
          <MenuItem onClick={onCustomize}>
            <Icon icon={Copy} size="sm" />
            Duplicate
          </MenuItem>
        </>
      )}
    </RowActionsMenu>
  );
}
