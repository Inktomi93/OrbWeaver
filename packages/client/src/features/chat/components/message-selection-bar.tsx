// The bulk-message SELECTION bar (ux-flow-revamp J6) — the `@orb/ui/selection-bar` chrome pinned above
// the composer while bulk-select mode is active (the chat options menu enters the mode; each row shows a
// checkbox, message-row.tsx). Shows the live count + a Delete action; the bar's own clear (X / Escape)
// CANCELS the mode. Renders null when the mode is off (the primitive's "render-when-nonzero is the
// caller's concern" contract — here: render-when-active).
//
// Delete wires the ALREADY-array-capable `chat.deleteMessages` verb (the same one message-actions-row
// calls single-message) with the whole selected set — zero server/contract change. A hard cascade → an
// AlertDialog confirm (never an undo-toast, DESIGN.md §9); on success it leaves select mode. Settle
// reconciles through the central invalidation seam + the bus's `messagesDeleted` re-fold (already wired).

import type { ChatId, MessageId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { SelectionBar } from "@orb/ui/selection-bar";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import {
  exitSelectionMode,
  readSelectedMessageIds,
  useSelectedCount,
  useSelectionActive,
} from "#state";

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

  if (!active) {
    return null;
  }

  const confirmDelete = (): void => {
    const messageIds = readSelectedMessageIds();
    if (messageIds.length === 0) {
      return;
    }
    void (async (): Promise<void> => {
      try {
        await remove.mutateAsync({ chatId, messageIds });
        exitSelectionMode(); // leave select mode once the delete lands.
      } catch {
        // The mutation's own `errorToast` already surfaced it; stay in select mode for retry.
      }
    })();
  };

  return (
    <SelectionBar count={count} onClear={exitSelectionMode}>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              intent="destructive"
              size="sm"
              disabled={count === 0}
              loading={remove.isPending}
            >
              Delete
            </Button>
          }
        />
        <AlertDialogPopup>
          <Stack gap="block">
            <AlertDialogTitle>Delete {count} selected message(s)?</AlertDialogTitle>
            {/* Plain children — AlertDialogDescription IS the <p>; a nested <Text> (also <p>) is invalid HTML. */}
            <AlertDialogDescription>
              This permanently removes them for everyone. This can't be undone.
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
              <AlertDialogClose
                render={
                  <Button intent="destructive" onClick={confirmDelete}>
                    Delete
                  </Button>
                }
              />
            </AlertDialogActions>
          </Stack>
        </AlertDialogPopup>
      </AlertDialog>
    </SelectionBar>
  );
}
