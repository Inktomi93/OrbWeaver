// The chats LIST band's import flow — the ONE home for getting a transcript into the library (the ratified
// list-pane grammar: the band's ghost Import beside the primary New; the room's ⋯ menu carries no lifecycle
// chrome). Drops one-or-many `.jsonl` files on `POST /api/import/chat`, which routes each to the portability
// registry's chat descriptor — the same import path a whole-bundle restore uses.
//
// The route answers 200 for an accepted batch even when every transcript inside it failed (per-file
// isolation), so the toast derives from the REAL per-file outcome, never from "it didn't throw" — an
// all-failed batch says WHY (the server's own reason: an unparseable file, or a transcript naming a
// character this account doesn't have yet). A batch that wrote real conversations while Memory is on keeps the
// dialog open on the memory-build offer, since an import enqueues no paid model run on its own. The dropzone stays
// live, so the offer's scope grows with each drop until a build starts, and a drop after that offers afresh.

import type { ImportWindow } from "@orb/contracts/chat";
import { mergeImportWindows } from "@orb/contracts/chat";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog, ImportedChatsMemoryOffer } from "#components";
import type { ChatImportResult } from "#data";
import { importChats, useInvalidation, useTRPC } from "#data";
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

/** The transcript-import dialog: drop `.jsonl` → upload → toast the real outcome → close when something landed,
 *  or stay on the memory-build offer when the batch wrote real conversations while Memory is on. */
export function ChatImportDialog({ open, onOpenChange }: ChatImportDialogProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // Read while open, and pessimistic until it lands: an unread switch closes the dialog as before, never strands it.
  const memoryOn = useQuery({ ...trpc.settings.getUserSettings.queryOptions(), enabled: open }).data?.config.memory.enabled === true;
  // The scope on offer: every drop since the last started build, merged. A closed dialog forgets it.
  const [offer, setOffer] = useState<{ readonly scope: ImportWindow; readonly started: boolean } | null>(null);
  const changeOpen = (next: boolean): void => {
    if (!next) {
      setOffer(null);
    }
    onOpenChange(next);
  };
  const offerScope = (scope: ImportWindow): void => {
    setOffer((prev) => ({ scope: prev === null || prev.started ? scope : mergeImportWindows(prev.scope, scope), started: false }));
  };

  const onFiles = (accepted: readonly File[]): void => {
    if (accepted.length === 0) {
      return;
    }
    importChats(accepted).then(
      (result) => {
        const notice = importNotice(result);
        notify[notice.kind](notice.message);
        if (result.imported.length === 0) {
          // Nothing landed — the toast named why; keep the dialog open so the owner can try another file.
          return;
        }
        // A raw multipart POST (not a tRPC mutation) — fire the same user-bus path-invalidate manually.
        invalidation.invalidateUser({ type: "chatsChanged" });
        if (memoryOn && result.memoryScope !== null) {
          offerScope(result.memoryScope);
          return;
        }
        // A drop that wrote no real conversation (a duplicate, a greeting-only transcript) leaves the scope as it
        // is, and an offer still waiting on a yes keeps the dialog open rather than being thrown away.
        if (offer !== null && !offer.started) {
          return;
        }
        changeOpen(false);
      },
      () => notify.error("Couldn't import the chat."),
    );
  };

  return (
    <FormDialog
      closeButton={true}
      description="SillyTavern .jsonl transcripts or orbweaver .orb.json exports. Import the character first: each chat attaches to the character it names."
      dismissLabel="Cancel"
      onOpenChange={changeOpen}
      open={open}
      title="Import chats"
    >
      <FileDropzone
        accept={TRANSCRIPT_ACCEPT}
        instructions="Drop files here or click to browse"
        multiple={true}
        onFilesSelected={({ accepted }): void => onFiles(accepted)}
      />
      <ImportedChatsMemoryOffer
        nested={true}
        onStarted={(): void => setOffer((prev) => (prev === null ? null : { ...prev, started: true }))}
        scope={offer?.scope ?? null}
      />
    </FormDialog>
  );
}
