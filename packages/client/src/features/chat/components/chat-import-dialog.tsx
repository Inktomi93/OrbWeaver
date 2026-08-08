// The chats LIST band's import flow — the ONE home for getting a transcript into the library (the ratified
// list-pane grammar: the band's ghost Import beside the primary New; the room's ⋯ menu carries no lifecycle
// chrome). Drops one-or-many `.jsonl` files on `POST /api/import/chat`, which routes each to the portability
// registry's chat descriptor — the same import path a whole-bundle restore uses.
//
// The route answers 200 for an accepted batch even when every transcript inside it failed (per-file
// isolation), so the toast derives from the REAL per-file outcome, never from "it didn't throw" — an
// all-failed batch says WHY (the server's own reason: an unparseable file, or a transcript naming a
// character this account doesn't have yet).

import { FileDropzone } from "@orb/ui/file-dropzone";
import type { ReactElement } from "react";
import { FormDialog } from "#components";
import type { ChatImportResult } from "#data";
import { importChats, useInvalidation } from "#data";
import { notify } from "#lib";

// Both chat formats the single-chat door accepts: the ST/share transcript and the R6 orb-native BUNDLE
// (which carries the room whole — injections, room overrides, the tag overlay, the rpg campaign). `.json`
// rides the accept list because a browser file picker filters on the LAST dot; the server tells the two
// apart by the file's own envelope, never by its name.
const TRANSCRIPT_ACCEPT = ".jsonl,.json,application/x-ndjson,application/json";

/** The toast to fire for one import batch — `kind` indexes `notify`. */
interface ImportNotice {
  readonly kind: "success" | "info" | "error";
  readonly message: string;
}

/** One failed transcript as a toast line: the server's own reason, prefixed with the file it came from. */
function failureMessage(failure: ChatImportResult["failed"][number]): string {
  return `${failure.filename}: ${failure.error}`;
}

/** Derive the toast from the real per-file outcome (the `importNotice` sibling the card import uses). */
function importNotice({ imported, failed }: ChatImportResult): ImportNotice {
  const [firstFailure] = failed;
  if (imported.length === 0) {
    return { kind: "error", message: firstFailure === undefined ? "Couldn't import the chat." : failureMessage(firstFailure) };
  }
  if (firstFailure === undefined) {
    return { kind: "success", message: imported.length === 1 ? "Chat imported." : `${imported.length} chats imported.` };
  }
  return {
    kind: "info",
    message: `${imported.length} of ${imported.length + failed.length} imported — ${failureMessage(firstFailure)}`,
  };
}

export interface ChatImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The transcript-import dialog: drop `.jsonl` → upload → toast the real outcome → close when something landed. */
export function ChatImportDialog({ open, onOpenChange }: ChatImportDialogProps): ReactElement {
  const invalidation = useInvalidation();

  const onFiles = (accepted: readonly File[]): void => {
    if (accepted.length === 0) {
      return;
    }
    void (async (): Promise<void> => {
      try {
        const result = await importChats(accepted);
        const notice = importNotice(result);
        notify[notice.kind](notice.message);
        if (result.imported.length === 0) {
          // Nothing landed — the toast named why; keep the dialog open so the owner can try another file.
          return;
        }
        // A raw multipart POST (not a tRPC mutation) — fire the same user-bus path-invalidate manually.
        invalidation.invalidateUser({ type: "chatsChanged" });
        onOpenChange(false);
      } catch {
        notify.error("Couldn't import the chat.");
      }
    })();
  };

  return (
    <FormDialog
      description="Drop chat files exported from orbweaver (.orb.json — the whole room) or transcripts from orbweaver or SillyTavern (.jsonl). Each lands on the character it names, so import that character's card first."
      onOpenChange={onOpenChange}
      open={open}
      title="Import a chat"
    >
      <FileDropzone
        accept={TRANSCRIPT_ACCEPT}
        hint="orbweaver or SillyTavern chat transcripts"
        instructions="Drop a chat file (.orb.json or .jsonl), or click to browse"
        multiple={true}
        onFilesSelected={({ accepted }): void => onFiles(accepted)}
      />
    </FormDialog>
  );
}
