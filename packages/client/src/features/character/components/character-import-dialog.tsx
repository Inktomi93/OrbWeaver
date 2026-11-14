// The characters LIST band's import flow — the ONE home for getting a card into the library (the ratified
// list-pane grammar: the band's ghost Import beside the primary New; the editor carries no lifecycle
// chrome). Drops one-or-many PNG/JSON character cards on `POST /api/import`, the multipart card route.
//
// The route answers 200 for an accepted batch even when every card inside it failed (per-card isolation),
// so "it didn't throw" is never a success signal: an all-failed batch says so on the dropzone's own error line (the dialog stays
// open for another file, so the line is already in front of the person and no toast repeats it), and a partial says how many of how many.

import type { CardImportResult } from "@orb/contracts/import";
import { FileDropzone } from "@orb/ui/file-dropzone";
import type { ReactElement } from "react";
import { useState } from "react";
import { DismissDialog } from "#components";
import { importCharacters, useInvalidation } from "#data";
import { cardImportPartialLine, cardImportRefusalLine, cardInLibraryNotice, cardsInLibraryNotice, DIALOG_VERBS, inLibraryClause, notify } from "#lib";
import { selectCharacter } from "#state";
import { CHARACTER_IMPORT_NAME } from "../lib/character-names.ts";

const CARD_ACCEPT = ".png,.json,image/png,application/json";

/** The toast to fire for a batch that landed at least one card — `kind` indexes `notify`. */
interface ImportNotice {
  readonly kind: "success" | "info";
  readonly message: string;
}

/** Derive the toast from the REAL per-file outcome (never from the uploaded filenames) of a batch that landed a card. A
 *  `created: false` card is one the library already held (D290), and the toast says so rather than "imported". */
function importNotice({ imported, failed }: CardImportResult): ImportNotice {
  if (failed.length === 0) {
    const landed = imported.filter((card) => card.created).length;
    const held = imported.filter((card) => !card.created);
    const [onlyHeld] = held;
    if (landed === 0) {
      return {
        kind: "info",
        message: held.length === 1 && onlyHeld !== undefined ? cardInLibraryNotice(onlyHeld.filename) : cardsInLibraryNotice(held.length),
      };
    }
    const landedLine = landed === 1 ? "Card imported" : `${landed} cards imported`;
    return { kind: "success", message: held.length === 0 ? `${landedLine}.` : `${landedLine}, ${inLibraryClause(held.length)}.` };
  }
  return {
    kind: "info",
    message: cardImportPartialLine(imported.length, failed),
  };
}

export interface CharacterImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The card-import dialog: drop PNG/JSON → upload → say the real outcome → open the imported card and close when something landed. */
export function CharacterImportDialog({ open, onOpenChange }: CharacterImportDialogProps): ReactElement {
  const invalidation = useInvalidation();
  const [refusal, setRefusal] = useState<string | null>(null);

  const onFiles = (accepted: readonly File[]): void => {
    if (accepted.length === 0) {
      return;
    }
    setRefusal(null);
    importCharacters(accepted).then(
      (result) => {
        if (result.imported.length === 0) {
          // Nothing landed: the dropzone's error line says why and the dialog stays open for another file.
          setRefusal(cardImportRefusalLine(result.failed));
          return;
        }
        const notice = importNotice(result);
        notify[notice.kind](notice.message);
        // A raw multipart POST (not a tRPC mutation) — fire the same user-bus path-invalidate manually.
        invalidation.invalidateUser({ type: "charactersChanged" });
        // Open what landed, like Create does — the first card of the batch when several came in.
        const [first] = result.imported;
        if (first !== undefined) {
          selectCharacter(first.characterId);
        }
        onOpenChange(false);
      },
      () => notify.error("Couldn't import the card."),
    );
  };

  return (
    // IT HAS A VISIBLE EXIT (side-eye 2026-08-30 rail-characters P2, #842). The dialog carried ZERO buttons
    // besides the file input on both the desktop and the 430px coarse arm — Escape worked, and touch has no
    // Escape. `dismissLabel` is the DismissDialog footer for a dialog with no confirm to pair a Cancel with
    // (the drop IS the act; there is nothing to submit), matching the sibling New-character dialog's exit.
    //
    // AND IT SAYS ITS ONE FACT ONCE. It used to state the accepted formats THREE times in a 250px dialog
    // with one control — the description, the dropzone's instruction and the dropzone's hint. The
    // INSTRUCTION is the one a user acts on, so it carries the formats; the other two stand down.
    <DismissDialog
      arriveOnTitle={true}
      closeButton={true}
      dismissLabel={DIALOG_VERBS.cancel}
      onOpenChange={(next): void => {
        if (!next) {
          setRefusal(null);
        }
        onOpenChange(next);
      }}
      open={open}
      title={CHARACTER_IMPORT_NAME}
    >
      <FileDropzone
        accept={CARD_ACCEPT}
        {...(refusal === null ? {} : { error: refusal })}
        subject="a SillyTavern character card (PNG or JSON)"
        multiple={true}
        onFilesSelected={({ accepted }): void => onFiles(accepted)}
      />
    </DismissDialog>
  );
}
