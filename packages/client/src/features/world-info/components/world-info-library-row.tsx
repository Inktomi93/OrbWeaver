// One book row in the World Info LIST (§13.2 entity-row primitive `@orb/ui/list-row` — leading glyph ·
// title/subtitle · trailing actions · selected). Clicking the row opens the book in the editor (`onSelect`
// → `selectWorldBook`, the §5.1 writer-only seam; the route is the single reader). A book attached GLOBALLY
// carries a passive `Badge` (leading) — a status marker, NOT a make-global affordance (activation lives in
// the book's CONTEXT panel). A kebab `Menu` holds Rename · Duplicate · Delete; Delete confirms via an
// AlertDialog (destructive → AlertDialog, §13.8 R4) and warns that the cascade drops every entry. Both
// overlays live HERE (a component), never in the surface (client-structure surface-purity).

import type { WorldBookId } from "@orb/kit/ids";
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
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Copy/Icon/MoreHorizontal/Pencil/Trash2 fine (the preset-library-row.tsx precedent).
import { Copy, Icon, MoreHorizontal, Pencil, Trash2 } from "@orb/ui/icons";
import { ListRow } from "@orb/ui/list-row";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";

/** The minimal book shape the row renders (a `BookView` slice — tRPC-inferred at the surface). */
export interface BookRowItem {
  readonly id: WorldBookId;
  readonly name: string;
  readonly description: string | null;
}

export interface WorldInfoLibraryRowProps {
  readonly book: BookRowItem;
  readonly selected: boolean;
  /** The book is attached globally (`listGlobal` membership) — a passive "Global" marker. */
  readonly global: boolean;
  readonly onSelect: (id: WorldBookId) => void;
  readonly onDelete: (id: WorldBookId) => void;
  readonly onDuplicate: (id: WorldBookId) => void;
  readonly onRename: (id: WorldBookId) => void;
}

/** A single world-book library row (its own kebab menu + delete-confirm dialog). */
export function WorldInfoLibraryRow({
  book,
  selected,
  global,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
}: WorldInfoLibraryRowProps): ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <ListRow
      clickable={true}
      selected={selected}
      onClick={(): void => onSelect(book.id)}
      title={book.name}
      {...(book.description ? { subtitle: book.description } : {})}
      {...(global ? { leading: <GlobalMarker /> } : {})}
      actions={
        <RowActions
          name={book.name}
          deleteOpen={deleteOpen}
          onDeleteOpenChange={setDeleteOpen}
          onDelete={(): void => onDelete(book.id)}
          onDuplicate={(): void => onDuplicate(book.id)}
          onRename={(): void => onRename(book.id)}
        />
      }
    />
  );
}

/** The leading passive GLOBAL marker (a compact `Badge`, info intent). */
function GlobalMarker(): ReactElement {
  return (
    <Badge intent="info" size="sm">
      Global
    </Badge>
  );
}

/** The trailing kebab menu (Rename · Duplicate · Delete) + the delete-confirm AlertDialog. */
function RowActions({
  name,
  deleteOpen,
  onDeleteOpenChange,
  onDelete,
  onDuplicate,
  onRename,
}: {
  readonly name: string;
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
            This permanently removes the book and every entry in it, and detaches it everywhere.
            This can't be undone.
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
