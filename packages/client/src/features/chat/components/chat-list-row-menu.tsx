// The chat-LIST row kebab (J5 · UIP-301) — the per-row overflow menu wiring the four host-only lifecycle
// verbs (Rename · Star · Archive · Delete) exposed by J5's router pass-throughs. A leaf component: it owns
// its own overlay state (rename Dialog + delete AlertDialog) and drives the mutation hooks; the row select
// never fires when the kebab is clicked (ListRow renders `actions` as a SIBLING outside the clickable
// body — a11y + no accidental navigation).
//
// REVERSIBILITY (DESIGN.md §9): rename/star/archive are quiet in-place edits; DELETE cascades hard
// (messages/roster/events, FK) — NOT reversible — so it sits behind an `@orb/ui/alert-dialog` confirm
// (never an undo-toast). Rename is a single controlled `Input` in a `Dialog` (the §13.4 "single rename
// stays controlled + Zod" carve-out — NOT a form factory).

import type { ChatId } from "@orb/kit/ids";
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
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the chat-list-surface.tsx precedent).
import { Archive, Icon, MoreVertical, Pencil, Star, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useTRPC } from "#data";
import {
  useArchiveChat,
  useDeleteChat,
  useStarChat,
  useUpdateChatTitle,
} from "../hooks/use-chat-row-mutations";
import { useInvalidation } from "../hooks/use-invalidation";

export interface ChatListRowMenuProps {
  readonly chatId: ChatId;
  /** The row's current title (seeds the rename input) — null renders as an empty field. */
  readonly title: string | null;
  readonly starred: boolean;
  readonly archived: boolean;
  /** Fired after a successful delete so the route can leave the room if it was the active one (J1). */
  readonly onDeleted?: ((chatId: ChatId) => void) | undefined;
}

/** The kebab menu + its rename/delete overlays for one chat-list row. */
export function ChatListRowMenu({
  chatId,
  title,
  starred,
  archived,
  onDeleted,
}: ChatListRowMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const starChat = useStarChat({ trpc, invalidation });
  const archiveChat = useArchiveChat({ trpc, invalidation });
  const deleteChat = useDeleteChat({ trpc, invalidation });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        onDeleted?.(chatId);
      } catch {
        // The failure toast (mutation `meta.errorToast`) already surfaced it; stay on the chat.
      }
    })();
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button intent="ghost" size="icon" aria-label="Chat actions">
              <Icon icon={MoreVertical} size="sm" />
            </Button>
          }
        />
        <MenuPopup align="end">
          <MenuItem onClick={openRename}>
            <Icon icon={Pencil} size="sm" />
            Rename
          </MenuItem>
          <MenuItem onClick={(): void => starChat.mutate({ chatId, star: !starred })}>
            <Icon icon={Star} size="sm" />
            {starred ? "Unstar" : "Star"}
          </MenuItem>
          <MenuItem onClick={(): void => archiveChat.mutate({ chatId, archived: !archived })}>
            <Icon icon={Archive} size="sm" />
            {archived ? "Unarchive" : "Archive"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={(): void => setDeleteOpen(true)}>
            <Icon icon={Trash2} size="sm" />
            Delete
          </MenuItem>
        </MenuPopup>
      </Menu>

      {/* Rename — a single controlled input (the §13.4 single-rename carve-out, not a form factory). */}
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
