// The chat OPTIONS menu (⋯) — the J3 identity header's chat-level action cluster (ux-flow-revamp J6; NT
// `chat-options-menu.tsx` parity). Registry-shaped over ALREADY-BUILT verbs + store actions, so later
// features enter as ROWS, not rework. Unbuilt NT items (per-chat persona, similar chats, persistent
// guides) are OMITTED — never a disabled stub pointing at nothing (§4.3 rule 1: no dead ends).
//
// The turn actions (Continue · Regenerate · Impersonate) reuse `useGuidedActions` (the composer wand's
// own dispatch) with an EMPTY steer — from the header there is no draft text, so these are the plain
// continue/reroll/impersonate (rule 10: same verb, same home, second entry point). Continue/Regenerate
// gate on a tail assistant slot (the wand's own `tailAssistantMessageId` gate). Rename is a single
// controlled input (the §13.4 single-rename carve-out, the ChatListRowMenu precedent); Delete cascades
// hard → an AlertDialog confirm (never an undo-toast, DESIGN.md §9), then `goToLanding` (the deleted
// chat's id would 404). The context-tab items jump the CONTEXT panel to a tab via the shell `contextTab`
// seam + dock it. Bulk "Select messages…" lands with the J6 selection-bar wiring (a later row here).

import { GUIDED_IMPERSONATE_PERSONS } from "@orb/contracts/preset";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the chat-list-row-menu.tsx precedent).
import { Icon, MessagesSquare, MoreHorizontal, Pencil, Trash2, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import {
  committedChat,
  enterSelectionMode,
  goToLanding,
  setContextTab,
  setPanelMode,
  startNewChat,
} from "#state";
import { useDeleteChat, useUpdateChatTitle } from "../hooks/use-chat-row-mutations";
import { useGuidedActions } from "../hooks/use-guided-actions";

/** Label per impersonate person word (the composer-wand `PERSON_LABEL` precedent — a `Record` dispatch,
 *  spine §5.5, so a new person word fails `tsc` here). */
const PERSON_LABEL: Record<(typeof GUIDED_IMPERSONATE_PERSONS)[number], string> = {
  first: "1st person",
  second: "2nd person",
  third: "3rd person",
};

export interface ChatOptionsMenuProps {
  readonly chatId: ChatId;
  /** The chat's current title (seeds the rename input). */
  readonly title: string | null;
  /** The chat's character cast — seeds "New chat with same cast" (omitted when empty / a solo assistant). */
  readonly characterIds: readonly CharacterId[];
  /** Whether the viewer is the host — gates the Preview-request jump (host-only server-side). */
  readonly isHost: boolean;
}

/** The ⋯ chat-options menu for the active chat's identity header. */
export function ChatOptionsMenu({
  chatId,
  title,
  characterIds,
  isHost,
}: ChatOptionsMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const deleteChat = useDeleteChat({ trpc, invalidation });
  const guided = useGuidedActions({ handle: committedChat(chatId) });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canTargetTail = guided.tailAssistantMessageId !== null;

  const openRename = (): void => {
    setRenameValue(title ?? "");
    setRenameOpen(true);
  };
  const saveRename = (): void => {
    const trimmed = renameValue.trim();
    updateTitle.mutate({ chatId, title: trimmed === "" ? null : trimmed });
    setRenameOpen(false);
  };
  const confirmDelete = (): void => {
    void (async (): Promise<void> => {
      try {
        await deleteChat.mutateAsync({ chatId });
        goToLanding(); // the deleted chat's id would 404 — leave the room.
      } catch {
        // The mutation's own `errorToast` already surfaced it; stay on the chat.
      }
    })();
  };
  // Jump the CONTEXT panel to a tab (the shell `contextTab` seam) AND ensure it's open (dock it).
  const openContextTab = (tab: string): void => {
    setContextTab(tab);
    setPanelMode("context", "docked");
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button intent="ghost" size="icon" aria-label="Chat options">
              <Icon icon={MoreHorizontal} size="sm" />
            </Button>
          }
        />
        <MenuPopup align="end">
          {characterIds.length > 0 ? (
            <MenuItem onClick={(): void => startNewChat({ characterIds })}>
              <Icon icon={MessagesSquare} size="sm" />
              New chat with same cast
            </MenuItem>
          ) : null}
          <MenuItem disabled={!canTargetTail} onClick={(): void => guided.fireContinue("")}>
            Continue
          </MenuItem>
          <MenuItem disabled={!canTargetTail} onClick={(): void => guided.fireSwipe("")}>
            Regenerate
          </MenuItem>
          <MenuSubmenuRoot>
            <MenuSubmenuTrigger>Impersonate</MenuSubmenuTrigger>
            <MenuPopup>
              {GUIDED_IMPERSONATE_PERSONS.map((person) => (
                <MenuItem key={person} onClick={(): void => guided.fireImpersonate("", person)}>
                  {PERSON_LABEL[person]}
                </MenuItem>
              ))}
            </MenuPopup>
          </MenuSubmenuRoot>

          <MenuSeparator />
          <MenuItem onClick={enterSelectionMode}>Select messages…</MenuItem>
          <MenuItem onClick={(): void => openContextTab("overrides")}>Chat overrides…</MenuItem>
          {isHost ? (
            <MenuItem onClick={(): void => openContextTab("preview")}>Preview request…</MenuItem>
          ) : null}
          <MenuItem onClick={(): void => openContextTab("injections")}>Injections…</MenuItem>

          <MenuSeparator />
          <MenuItem onClick={openRename}>
            <Icon icon={Pencil} size="sm" />
            Rename
          </MenuItem>
          <MenuItem onClick={goToLanding}>
            <Icon icon={X} size="sm" />
            Close chat
          </MenuItem>
          <MenuItem onClick={(): void => setDeleteOpen(true)}>
            <Icon icon={Trash2} size="sm" />
            Delete chat
          </MenuItem>
        </MenuPopup>
      </Menu>

      {/* Rename — a single controlled input (§13.4 single-rename carve-out, the ChatListRowMenu precedent). */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogPopup size="sm">
          <Stack gap="block">
            <DialogTitle>Rename chat</DialogTitle>
            <Input
              aria-label="Chat title"
              value={renameValue}
              onValueChange={setRenameValue}
              placeholder="Untitled chat"
            />
            <Row gap="row" justify="end">
              <DialogClose render={<Button intent="ghost">Cancel</Button>} />
              <Button intent="primary" onClick={saveRename}>
                Save
              </Button>
            </Row>
          </Stack>
        </DialogPopup>
      </Dialog>

      {/* Delete — a hard, non-reversible cascade → an explicit confirm (never an undo-toast). */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <Stack gap="block">
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              <Text tone="muted">
                This permanently deletes the chat and its messages for everyone. This can't be
                undone.
              </Text>
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
    </>
  );
}
