// The "Attach a world book" PICKER (host only) — the caller's own books, minus the ones already attached to
// this room, each one a one-shot `worldInfo.attachToChat`.
//
// THE DIALOG IS THE CONSENT MOMENT, SO IT SPELLS THE WRITE REACH. Attaching is not "adding a reference":
// `domain/automation` refuses an `insert_world_info_entry` rule at MINT (`substrate/validate.ts`
// `assertBooksAttached`) and again at FIRE (`engine/arm-executors.ts`: "the attachment IS the room's
// consent") unless the target book is attached HERE. So this room's rules can write entries into whatever
// is attached, and the host granting that reach has to be told in words before they grant it — a quiet
// checkbox would be the affordance lie the sibling documents rack exists to correct. The description says
// both halves (fires here / can be written into here) and names the way back out.
//
// IT IS NOT THE ONLY GATE, AND IT DOES NOT SAY IT IS. Books stay owner-owned (D23): the entry writer
// (`worldInfo.upsertEntries`) loads the book through `loadOwnedBook` against the RULE AUTHOR, so a rule can
// only ever write into a book its own author owns. Attachment is the ROOM's half of the permission, and the
// copy is scoped to the room accordingly.
//
// NO SEARCH BOX, DELIBERATELY. `worldInfo.listBooks` is owner-scoped and UNPAGED (its verb reads the whole
// library), so unlike the paged `databank.list` the picker has no page for a candidate to fall off the end
// of — a box here would be decoration over a list that is already complete. The `persona.list` section in
// `book-attachments.tsx` is the same call for the same reason.
//
// The dialog closes on the first pick rather than staying open for a multi-select: attach is idempotent and
// instant, the rack behind it repaints, and a stay-open picker would have to re-derive its own offer set
// mid-flight to avoid offering back the book it just attached (the `add-chat-document-dialog` ruling).

import type { ChatId, WorldBookId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { BookOpen, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { FormDialog } from "#components";
import { SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useAttachBookToChat } from "../hooks/use-chat-book-mutations.ts";
import { attachableBooks } from "../lib/chat-books-model.ts";

/** The candidate list's shape-matched loading skeleton (house loading law — never a spinner/text void). */
const PICKER_SKELETON_ROWS = 3;

export interface AddChatBookDialogProps {
  readonly chatId: ChatId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The book ids already attached to this room — the subtraction operand. Passed IN rather than re-read so
   *  the offer set and the rack behind it are computed from ONE snapshot of the room. */
  readonly attachedIds: readonly WorldBookId[];
}

export function AddChatBookDialog({ chatId, open, onOpenChange, attachedIds }: AddChatBookDialogProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachBookToChat({ trpc, invalidation });
  const ownedRef = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  const attachBook = async (bookId: WorldBookId): Promise<void> => {
    if (ownedRef.current) {
      return;
    }
    ownedRef.current = true;
    setFailure(null);
    try {
      await attach.mutateAsync({ chatId, bookId });
      onOpenChange(false);
    } catch {
      setFailure("Couldn't attach the world book to this chat.");
    } finally {
      ownedRef.current = false;
    }
  };

  return (
    <FormDialog
      description="Its entries can fire in this room's prompts for everyone here — and an automation rule in this room can write new entries into it. Attaching is what grants that write reach; you can take it back out here at any time."
      onOpenChange={(next): void => {
        if (next || !ownedRef.current) {
          onOpenChange(next);
        }
      }}
      open={open}
      title="Attach a world book to this chat"
    >
      {/* Non-suspending: the dialog frame paints at once and the candidate list fills in, so opening the
          picker never blanks the panel behind it through a shared suspense boundary. */}
      <PickerBody attachedIds={attachedIds} failure={failure} isOwned={attach.isPending} onAttach={attachBook} />
    </FormDialog>
  );
}

function PickerBody({
  attachedIds,
  failure,
  isOwned,
  onAttach,
}: {
  readonly attachedIds: readonly WorldBookId[];
  readonly failure: string | null;
  readonly isOwned: boolean;
  readonly onAttach: (bookId: WorldBookId) => Promise<void>;
}): ReactElement {
  const trpc = useTRPC();
  const library = useQuery(trpc.worldInfo.listBooks.queryOptions());
  const books = library.data ?? [];
  const candidates = attachableBooks(books, attachedIds);

  if (library.isPending) {
    return <SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" />;
  }

  // TWO different nothings, said differently (empty states are load-bearing): an empty LIBRARY is "go make
  // one", and a library whose every book already reaches this room is a success state, not a failure.
  if (candidates.length === 0) {
    return (
      <EmptyState
        // The only next action REACHABLE from inside a modal is leaving it — the library lives behind the
        // rail, which this dialog is covering. Naming that honestly beats a CTA that cannot fire.
        action={<DialogClose render={<Button intent="secondary">Close</Button>} />}
        description={
          books.length === 0
            ? "Make one in World info — a book of entries that fire on the keywords you give them — and it can feed this chat."
            : "Every world book you own is already attached to this chat."
        }
        icon={<Icon icon={BookOpen} size="lg" />}
        title={books.length === 0 ? "You have no world books yet" : "Nothing left to attach"}
      />
    );
  }

  return (
    <Stack gap="tight">
      {candidates.map((book) => (
        <ListRow
          actions={
            <Button
              aria-label={`Attach ${book.name} to this chat`}
              disabled={isOwned}
              intent="secondary"
              onClick={(): void => void onAttach(book.id)}
              size="sm"
              type="button"
            >
              Attach
            </Button>
          }
          key={book.id}
          {...(book.description === null || book.description === "" ? {} : { subtitle: book.description })}
          title={book.name}
        />
      ))}
      {failure === null ? null : (
        <Text className="text-destructive" role="alert" voice="label">
          {failure}
        </Text>
      )}
    </Stack>
  );
}
