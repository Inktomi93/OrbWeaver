// The per-theme-row action menu — the Your-themes row's ⋯ (#866 S4, the owner-approved canvas: Apply ·
// Edit in builder · Export · Delete). Owned rows only: the three shipped looks are CARDS with no
// lifecycle (a closed set), so the seed arm this menu used to carry died with the theme modal. Delete is
// confirm-gated (UI-Primitives §13.8 R4 — destructive → AlertDialog; deleting an authored theme incl.
// its custom CSS is unrecoverable, so a misclick under Export must not fire it). A COMPONENT, not part of
// the section surface, so the destructive <AlertDialog> stays legal (client-structure rule 7).

import type { Theme } from "@orb/contracts/theme";
import { Check, Download, Icon, Pencil } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { RowActionsMenu } from "#components";

export interface ThemeRowMenuProps {
  readonly theme: Theme;
  readonly onApply: () => void;
  readonly onEdit: () => void;
  readonly onExport: () => void;
  readonly onDelete: () => void;
}

/** An owned theme row's ⋯ — Apply · Edit in builder · Export · Delete (confirm-gated). */
export function ThemeRowMenu({ theme, onApply, onEdit, onExport, onDelete }: ThemeRowMenuProps): ReactElement {
  return (
    <RowActionsMenu
      destructive={{
        title: "Delete this theme?",
        description: `This permanently deletes “${theme.name}”, including its custom CSS. This can't be undone.`,
        onConfirm: onDelete,
      }}
      label={`Actions for ${theme.name}`}
      triggerSize="sm"
    >
      <MenuItem onClick={onApply}>
        <Icon icon={Check} size="sm" />
        Apply
      </MenuItem>
      <MenuItem onClick={onEdit}>
        <Icon icon={Pencil} size="sm" />
        Edit in builder
      </MenuItem>
      <MenuItem onClick={onExport}>
        <Icon icon={Download} size="sm" />
        Export
      </MenuItem>
    </RowActionsMenu>
  );
}
