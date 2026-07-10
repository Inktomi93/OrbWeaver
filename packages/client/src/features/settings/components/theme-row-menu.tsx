// The per-theme-row action menu (extracted from theme-picker-surface so the destructive-delete
// <AlertDialog> is legal here — a surface may not render its own modal root, client-structure rule 7;
// a COMPONENT may, the persona-panel-row precedent). Seeds offer only Customize (duplicate-to-edit);
// owned rows offer Edit · Duplicate · Delete, where Delete is confirm-gated (UI-Primitives §13.8 R4 —
// destructive → AlertDialog; mirrors the same-wave persona-row delete). Deleting an authored theme
// (incl. its custom CSS) is unrecoverable, so a misclick under Duplicate must not fire it.

import type { Theme } from "@orb/contracts/theme";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve every glyph fine (the character-library-surface.tsx precedent).
import { Copy, Icon, Pencil, Trash2 } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";

export interface ThemeRowMenuProps {
  readonly theme: Theme;
  readonly onCustomize: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/** A theme row's action menu — Delete is AlertDialog-confirmed (destructive, no undo). */
export function ThemeRowMenu({
  theme,
  onCustomize,
  onEdit,
  onDelete,
}: ThemeRowMenuProps): ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger
          render={<Button intent="ghost" size="sm" aria-label={`${theme.name} actions`} />}
        >
          ⋯
        </MenuTrigger>
        <MenuPopup align="end">
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
              <MenuSeparator />
              <MenuItem onClick={(): void => setDeleteOpen(true)}>
                <Icon icon={Trash2} size="sm" />
                Delete
              </MenuItem>
            </>
          )}
        </MenuPopup>
      </Menu>

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogPopup>
          <Stack gap="block">
            <AlertDialogTitle>Delete this theme?</AlertDialogTitle>
            {/* Plain children — AlertDialogDescription IS the <p>; a nested <Text> (also <p>) is invalid HTML. */}
            <AlertDialogDescription>
              This permanently deletes “{theme.name}”, including its custom CSS. This can't be
              undone.
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
              <AlertDialogClose
                render={
                  <Button intent="destructive" onClick={onDelete}>
                    Delete
                  </Button>
                }
              />
            </AlertDialogActions>
          </Stack>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
