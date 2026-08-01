// The characters LIST band's import flow — the ONE home for getting a card into the library (the ratified
// list-pane grammar: the band's ghost Import beside the primary New; the editor carries no lifecycle
// chrome). Drops one-or-many PNG/JSON character cards on `POST /api/import`, the multipart card route.
//
// The route answers 200 for an accepted batch even when every card inside it failed (per-card isolation),
// so "it didn't throw" is never a success signal: an all-failed batch says WHY (the server's own reason —
// the `card_unreadable` throw in domain/import), and a partial says how many of how many.

import { FileDropzone } from "@orb/ui/file-dropzone";
import type { ReactElement } from "react";
import { FormDialog } from "#components";
import type { CardImportResult } from "#data";
import { importCharacters, useInvalidation } from "#data";
import { notify } from "#lib";

const CARD_ACCEPT = ".png,.json,image/png,application/json";

/** The toast to fire for one import batch — `kind` indexes `notify`. */
interface ImportNotice {
  readonly kind: "success" | "info" | "error";
  readonly message: string;
}

/** The toast line for one rejected card: the server's own reason, prefixed with the file it came from. */
function cardFailureMessage(failure: CardImportResult["failed"][number]): string {
  return failure.filename === null ? failure.error : `${failure.filename}: ${failure.error}`;
}

/** Derive the toast from the REAL per-file outcome (never from the uploaded filenames). */
function importNotice({ imported, failed }: CardImportResult): ImportNotice {
  const [firstFailure] = failed;
  if (imported.length === 0) {
    return { kind: "error", message: firstFailure === undefined ? "Couldn't import the card." : cardFailureMessage(firstFailure) };
  }
  if (firstFailure === undefined) {
    return { kind: "success", message: imported.length === 1 ? "Card imported." : `${imported.length} cards imported.` };
  }
  return {
    kind: "info",
    message: `${imported.length} of ${imported.length + failed.length} imported — ${cardFailureMessage(firstFailure)}`,
  };
}

export interface CharacterImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The card-import dialog: drop PNG/JSON → upload → toast the real outcome → close when something landed. */
export function CharacterImportDialog({ open, onOpenChange }: CharacterImportDialogProps): ReactElement {
  const invalidation = useInvalidation();

  const onFiles = (accepted: readonly File[]): void => {
    if (accepted.length === 0) {
      return;
    }
    void (async (): Promise<void> => {
      try {
        const result = await importCharacters(accepted);
        const notice = importNotice(result);
        notify[notice.kind](notice.message);
        if (result.imported.length === 0) {
          // Nothing landed — the toast named why; keep the dialog open so the owner can try another file.
          return;
        }
        // A raw multipart POST (not a tRPC mutation) — fire the same user-bus path-invalidate manually.
        invalidation.invalidateUser({ type: "charactersChanged" });
        onOpenChange(false);
      } catch {
        notify.error("Couldn't import the card.");
      }
    })();
  };

  return (
    <FormDialog description="Drop a SillyTavern character card (PNG or JSON)." onOpenChange={onOpenChange} open={open} title="Import a character card">
      <FileDropzone
        accept={CARD_ACCEPT}
        hint="SillyTavern character cards (PNG or JSON)"
        instructions="Drop a card, or click to browse"
        multiple={true}
        onFilesSelected={({ accepted }): void => onFiles(accepted)}
      />
    </FormDialog>
  );
}
