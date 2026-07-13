// One preset row in the Presets LIST. A `@orb/ui/list-row`; clicking it opens the preset in the editor.
// The system-default row is marked (editing it COWs into a fork server-side) and cannot be deleted. The
// active-for-generation preset carries a passive amber Badge (a status marker, not a make-active
// affordance — activation is the LIST dropdown only). A kebab Menu holds Rename/Duplicate/Delete; Delete
// confirms via an AlertDialog that warns when the row is the active preset.

import type { PresetId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Copy/Icon/Lock/MoreHorizontal/Pencil/Trash2 fine (the credential-key-row.tsx precedent).
import { Copy, Icon, Lock, MoreHorizontal, Pencil, Trash2 } from "@orb/ui/icons";
import { ListRow } from "@orb/ui/list-row";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";

/** The minimal preset shape the row renders (a `PresetSummary` — tRPC-inferred at the surface). */
export interface PresetRowItem {
  readonly id: PresetId;
  readonly name: string;
  readonly isSystemDefault: boolean;
}

export interface PresetLibraryRowProps {
  readonly preset: PresetRowItem;
  readonly selected: boolean;
  /** The row is the ACTIVE-for-generation preset (`preset.id === seeds.defaultPresetId`) — passive marker. */
  readonly active: boolean;
  readonly onSelect: (id: PresetId) => void;
  readonly onDelete: (id: PresetId) => void;
  readonly onDuplicate: (id: PresetId) => void;
  readonly onRename: (id: PresetId) => void;
}

/** A single preset library row (its own kebab menu + delete-confirm dialog). */
export function PresetLibraryRow({
  preset,
  selected,
  active,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
}: PresetLibraryRowProps): ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <ListRow
      clickable={true}
      selected={selected}
      onClick={(): void => onSelect(preset.id)}
      title={preset.name}
      {...(active ? { leading: <ActiveMarker /> } : {})}
      {...(preset.isSystemDefault
        ? {
            subtitle: "Built-in default",
            ...(active ? {} : { leading: <Icon icon={Lock} size="sm" /> }),
          }
        : {
            actions: (
              <RowActions
                name={preset.name}
                active={active}
                deleteOpen={deleteOpen}
                onDeleteOpenChange={setDeleteOpen}
                onDelete={(): void => onDelete(preset.id)}
                onDuplicate={(): void => onDuplicate(preset.id)}
                onRename={(): void => onRename(preset.id)}
              />
            ),
          })}
    />
  );
}

/** The leading passive amber ACTIVE marker (a compact `Badge`, primary intent — the amber accent). */
function ActiveMarker(): ReactElement {
  return (
    <Badge intent="primary" size="sm">
      Active
    </Badge>
  );
}

/** The trailing kebab menu (Rename · Duplicate · Delete) + the delete-confirm AlertDialog. */
function RowActions({
  name,
  active,
  deleteOpen,
  onDeleteOpenChange,
  onDelete,
  onDuplicate,
  onRename,
}: {
  readonly name: string;
  readonly active: boolean;
  readonly deleteOpen: boolean;
  readonly onDeleteOpenChange: (open: boolean) => void;
  readonly onDelete: () => void;
  readonly onDuplicate: () => void;
  readonly onRename: () => void;
}): ReactElement {
  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button intent="ghost" size="sm" aria-label={`Actions for ${name}`}>
              <Icon icon={MoreHorizontal} size="sm" />
            </Button>
          }
        />
        <MenuPopup>
          <MenuItem onClick={onRename}>
            <Icon icon={Pencil} size="sm" />
            Rename
          </MenuItem>
          <MenuItem onClick={onDuplicate}>
            <Icon icon={Copy} size="sm" />
            Duplicate
          </MenuItem>
          <MenuItem onClick={(): void => onDeleteOpenChange(true)}>
            <Icon icon={Trash2} size="sm" />
            Delete
          </MenuItem>
        </MenuPopup>
      </Menu>
      <AlertDialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
        <AlertDialogPopup>
          <AlertDialogTitle>{`Delete "${name}"?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {active
              ? "This is your active preset for generation. Deleting it clears the active pick — new chats fall back to the built-in default. This can't be undone."
              : "This permanently removes the preset. This can't be undone."}
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
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
