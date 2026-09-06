// The #1598 explicit RESTORE door, surfaced (#1709): "put this card's own embedded world book back",
// beside the read-only import metadata it belongs next to in the Provenance facet. A file picker (the
// card's ORIGINAL bytes — the route matches on the character those exact bytes imported as) → a confirm
// naming exactly what it overwrites → the existing `/api/import/restore-card-lorebook` POST. Owner-gated
// the way the editor's other consequential doors are (`CharacterHistoryTab`'s snapshot Restore): a
// `ConfirmDialog` between the pick and the write, never a silent overwrite of an edited book.
//
// Only offered on an IMPORTED character (`importedFrom !== null` — a hand-authored card has no card file to
// restore from). The refusal the server returns for a card that doesn't match anything this owner imported
// is DATA, not a throw (`restoreCardLorebook`'s doc) — thrown here inside `onConfirm` so `ConfirmDialog`'s
// own in-dialog failure/retry surface renders it verbatim (#1563's contract), instead of a second ad hoc
// error UI.

import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import { restoreCardLorebook, useInvalidation } from "#data";
import { notify } from "#lib";

const CARD_ACCEPT = ".png,.json,image/png,application/json";

export interface CharacterRestoreBookActionProps {
  /** `false` on a hand-authored character (no `importedFrom`) — the caller decides visibility; this
   *  component renders nothing rather than a door to a route that can only refuse. */
  readonly canRestore: boolean;
}

/** The picked file's confirm copy — a function so the filename interpolates without a `useState` derived
 *  string the picked-file state itself already answers. */
function confirmDescription(filename: string): string {
  return `This replaces the character's current world book with the one embedded in "${filename}" — any edits you made to the current book since it was imported are lost.`;
}

export function CharacterRestoreBookAction({ canRestore }: CharacterRestoreBookActionProps): ReactElement | null {
  const invalidation = useInvalidation();
  const [picked, setPicked] = useState<File | null>(null);

  if (!canRestore) {
    return null;
  }

  const onConfirm = async (): Promise<void> => {
    if (picked === null) {
      return;
    }
    const result = await restoreCardLorebook(picked);
    if (!result.ok) {
      // Rendered by ConfirmDialog's own failure surface (thrown, never notified) — the server's exact
      // reason ("No character of yours was imported from this exact card file…") IS the useful message.
      throw new Error(result.error);
    }
    // A raw multipart POST (not a tRPC mutation) — fire the user-bus path-invalidates by hand, exactly
    // like `character-import-dialog.tsx`'s card import. Both planes the write can touch: the world-info
    // store (the book/entries themselves) and the character's own read model (its book link).
    invalidation.invalidateUser({ type: "worldInfoChanged" });
    invalidation.invalidateUser({ type: "charactersChanged" });
    notify.success(result.replaced ? "The card's world book replaced your edited one." : "The card's world book was restored.");
  };

  return (
    <>
      <FileTrigger accept={CARD_ACCEPT} onFilesSelected={([file]): void => setPicked(file ?? null)}>
        {({ open }): ReactElement => (
          <Button intent="ghost" onClick={open}>
            Restore the embedded book from this card file
          </Button>
        )}
      </FileTrigger>
      <ConfirmDialog
        confirmIntent="primary"
        confirmLabel="Restore"
        description={picked === null ? undefined : confirmDescription(picked.name)}
        onConfirm={onConfirm}
        onOpenChange={(open): void => {
          if (!open) {
            setPicked(null);
          }
        }}
        open={picked !== null}
        title="Restore the embedded book from this card file?"
      />
    </>
  );
}
