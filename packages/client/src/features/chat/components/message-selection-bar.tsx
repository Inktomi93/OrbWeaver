// The bulk-message SELECTION bar — the `@orb/ui/selection-bar` chrome pinned above
// the composer while bulk-select mode is active (the chat options menu enters the mode; each row shows a
// checkbox, message-row.tsx). Shows the live count + a Delete action; the bar's own clear (X / Escape)
// CANCELS the mode. Renders null when the mode is off (the primitive's "render-when-nonzero is the
// caller's concern" contract — here: render-when-active).
//
// Delete wires the ALREADY-array-capable `chat.deleteMessages` verb (the same one message-actions-row
// calls single-message) with the whole selected set — zero server/contract change. A hard cascade → an
// AlertDialog confirm (never an undo-toast, the mock design §9); on success it leaves select mode. Settle
// reconciles through the central invalidation seam + the bus's `messagesDeleted` re-fold (already wired).
//
// THE SECOND `chat.deleteMessages` DOOR, RATIFIED (#568 — budget `chats::chat.deleteMessages: 2`). The two
// doors are not one verb wearing two faces: they belong to different MODES and different cardinalities. This
// bar exists only while bulk-select mode is on, deletes the whole selected set, names the count in its
// confirm ("Delete N selected message(s)?") and exits the mode on success; the row's ⋯ item is the
// single-message door available at rest with no mode to enter. Collapsing either into the other would make
// deleting one message require entering a mode, or deleting twenty require twenty confirms.

import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { SelectionBar } from "@orb/ui/selection-bar";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { exitSelectionMode, readSelectedMessageIds, useSelectedCount, useSelectionActive } from "#state";

interface DeleteVars {
  readonly chatId: ChatId;
  readonly messageIds: MessageId[];
}

// Module-scope factory (§13.1) — BUS-DRIVEN: `deleteMessages` emits messagesDeleted (→ chatReads) on the
// OPEN chat, delivered by the active subscription → the seam refetches. `busDriven`; the removed
// keys were a redundant backstop (the mutation-vs-bus rule, invalidation.ts).
const useDeleteMessages = createEntityMutation<DeleteVars, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the selected messages.",
});

export interface MessageSelectionBarProps {
  readonly chatId: ChatId;
}

/** The bulk-select action bar for the active chat — renders only while select mode is on. */
export function MessageSelectionBar({ chatId }: MessageSelectionBarProps): ReactElement | null {
  const active = useSelectionActive();
  const count = useSelectedCount();
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const remove = useDeleteMessages({ trpc, invalidation });
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!active) {
    return null;
  }

  const confirmDelete = (): void => {
    const messageIds = readSelectedMessageIds();
    if (messageIds.length === 0) {
      return;
    }
    remove.mutate({ chatId, messageIds }, { onSuccess: exitSelectionMode });
  };

  return (
    <SelectionBar count={count} onClear={exitSelectionMode}>
      <Button intent="destructive" size="sm" disabled={count === 0} loading={remove.isPending} onClick={(): void => setDeleteOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${count} selected message(s)?`}
        description="This permanently removes them for everyone. This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </SelectionBar>
  );
}
