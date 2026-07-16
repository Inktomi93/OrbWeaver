// One book row in the World Info LIST — a shared `LibraryRow` (§13.2 entity row → RowActionsMenu). Clicking
// the row opens the book in the editor (`onSelect` → `selectWorldBook`, the §5.1 writer-only seam; the route
// is the single reader). A book attached GLOBALLY carries a passive `Badge` (leading) — a status marker, NOT
// a make-global affordance (activation lives in the book's CONTEXT panel). The Rename · Duplicate · Delete
// menu + its delete-confirm (warning that the cascade drops every entry) live in LibraryRow.

import type { WorldBookId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import type { ReactElement } from "react";
import { LibraryRow } from "#components";

/** The minimal book shape the row renders (a `BookView` slice — tRPC-inferred at the surface). */
interface BookRowItem {
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

/** A single world-book library row (its Rename/Duplicate/Delete menu + delete-confirm come from LibraryRow). */
export function WorldInfoLibraryRow({ book, selected, global, onSelect, onDelete, onDuplicate, onRename }: WorldInfoLibraryRowProps): ReactElement {
  return (
    <LibraryRow
      actions={{
        name: book.name,
        onRename: (): void => onRename(book.id),
        onDuplicate: (): void => onDuplicate(book.id),
        onDelete: (): void => onDelete(book.id),
        deleteDescription: "This permanently removes the book and every entry in it, and detaches it everywhere. This can't be undone.",
      }}
      onSelect={(): void => onSelect(book.id)}
      selected={selected}
      title={book.name}
      {...(book.description !== null && book.description !== "" ? { subtitle: book.description } : {})}
      {...(global ? { leading: <GlobalMarker /> } : {})}
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
