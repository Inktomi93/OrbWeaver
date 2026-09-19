// The per-chat WORLD BOOKS rack — "which books this room carries", and the host's attach/detach over them
// (#640). The write half of `worldInfo.attachToChat` had no client affordance at all until this section:
// `chat_books` rows were written only by the server (the ST import and the host-handoff repoint), so a room
// could only ever carry the books someone else's code had put there.
//
// ATTACHMENT IS THE ROOM'S CONSENT, SO THE RACK SAYS SO. `domain/automation` refuses an
// `insert_world_info_entry` rule at MINT (`substrate/validate.ts`) and again at FIRE
// (`engine/arm-executors.ts:110` — "the attachment IS the room's consent") unless the target book is
// attached to that chat. Attaching therefore grants this room's rules WRITE reach into the book, not just a
// read of it, and the gloss states that in words before the host ever opens the picker. It is not the only
// gate and does not claim to be: books stay owner-owned (D23) and the entry writer loads the book through
// `loadOwnedBook` against the RULE'S AUTHOR, so a rule only ever writes into a book its own author owns —
// attachment is the ROOM's half of the permission, which is the half this pane owns.
//
// ONE COMPONENT, NO SEPARATE MEMBER MODE (`no-separate-reduced-modes`). `worldInfo.listForChat` is
// member-READABLE by design (its verb's gate is `requireChatMember`: the attached books are room-public
// prompt content every member's turns assemble against), so a member renders the identical rows and simply
// gets no attach and no detach — the §8.1 permission-OMIT at ROW level, never a disabled control.
//
// WHY THE RACK IS HERE AND NOT ON THE BOOK. `databank-active-in.tsx`'s header records the ruling for the
// identical shape: chats carry no `ownerId` (D18) and `attachToChat` is host-gated, so a junction row
// OUTLIVES the attacher's seat and a library-side roster of rooms would tell an ex-host that a room they can
// no longer open still carries their book. The library side is read-only there for that reason, and
// world-info has no per-book reverse index of chats at all — so a book-side switch could not even render the
// state it would be toggling. The write lives where the authority lives, and the authority is the room's.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Unlink } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { rowActionsName } from "#lib";
import { useDetachBookFromChat } from "../hooks/use-chat-book-mutations.ts";
import { AddChatBookDialog } from "./add-chat-book-dialog.tsx";

/** One row of the rack — DERIVED from the read's wire type, never re-spelled (§5.4). */
type ChatBook = inferOutput<Trpc["worldInfo"]["listForChat"]>[number];

export interface ChatBooksSectionProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
}

/** The "World books" section body — the books this room carries, one row each. */
export function ChatBooksSection({ chatId, isHost }: ChatBooksSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const detach = useDetachBookFromChat({ trpc, invalidation });
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listForChat.queryOptions({ chatId }));

  return (
    <Stack gap="block">
      {/* The write-reach sentence, in the room whose consent it is. A host reads what attaching PERMITS
          before they attach; a member reads why books they cannot touch are shaping their turns. */}
      <Text voice="gloss">
        {isHost
          ? "Entries from these books can fire in this room's prompts, for everyone here — and an automation rule in this room can write new entries into one of your own books. Attaching is what grants that write reach; detaching takes it back."
          : "Entries from these books can fire in this room's prompts, for everyone here. Only the host attaches or removes one."}
      </Text>

      {books.length === 0 ? (
        // Never render nothing: "no books attached" is the normal starting state, and a blank block reads as
        // a failed load (empty states are load-bearing).
        <Text voice="gloss">
          {isHost
            ? "No world books are attached to this chat yet."
            : "No world books are attached to this chat yet — the host attaches the ones this room carries."}
        </Text>
      ) : (
        <Stack gap="tight">
          {books.map((book) => (
            <ChatBookRow book={book} isHost={isHost} key={book.id} onDetach={(): void => detach.mutate({ chatId, bookId: book.id })} />
          ))}
        </Stack>
      )}

      {/* A member gets no attach affordance at all — not a disabled one. The sentence that would otherwise
          be missing (how does a book get here?) is the member gloss above. */}
      {isHost ? (
        <>
          <Button intent="secondary" onClick={(): void => setPickerOpen(true)} size="sm" type="button">
            Attach a world book
          </Button>
          <AddChatBookDialog attachedIds={books.map((book) => book.id)} chatId={chatId} onOpenChange={setPickerOpen} open={pickerOpen} />
        </>
      ) : null}
    </Stack>
  );
}

interface ChatBookRowProps {
  readonly book: ChatBook;
  readonly isHost: boolean;
  readonly onDetach: () => void;
}

/** One attached book. EVERY row offers the host a detach — unlike the documents rack, where a global or
 *  character-carried document is not this room's to remove: `chat_books` has exactly one junction, so a row
 *  here is always the room's own attachment. (`detachFromChat` is host-gated and deliberately does NOT
 *  re-check book ownership, so a book a PREVIOUS host attached is detachable too — that is the verb's
 *  stated reason for the asymmetry, and the row would otherwise be a dead end after a handoff.) */
function ChatBookRow({ book, isHost, onDetach }: ChatBookRowProps): ReactElement {
  return (
    <ListRow
      // A MEMBER's row renders NO trailing cluster at all — not a disabled one (permission-OMIT; a control a
      // member cannot operate is the affordance lie the sibling documents rack exists to correct).
      {...(isHost
        ? {
            actions: (
              <RowActionsMenu label={rowActionsName(book.name)}>
                <MenuItem onClick={onDetach}>
                  <Icon icon={Unlink} size="sm" />
                  Detach from this chat
                </MenuItem>
              </RowActionsMenu>
            ),
          }
        : {})}
      {...(book.description === null || book.description === "" ? {} : { subtitle: book.description })}
      title={book.name}
    />
  );
}
