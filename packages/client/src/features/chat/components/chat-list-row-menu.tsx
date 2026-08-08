// The chat-LIST row kebab (J5 · UIP-301) — the per-row overflow menu wiring the host-only lifecycle verbs
// (Rename · Star · Archive · Export · Delete) over the shared `RowActionsMenu` composite (⋯ trigger → items
// → the ConfirmDialog-wired destructive Delete). A leaf component: it owns the rename Dialog state + drives
// the mutation hooks; the row select never fires when the kebab is clicked (ListRow renders `actions` as a
// SIBLING outside the clickable body).
//
// EXPORT lives HERE and nowhere else (the ratified lifecycle placement: import on the list band, export on
// the row kebab; the chat room carries no lifecycle chrome). It is a plain download LINK to the host-gated
// `GET /api/export/chat/:id` — a non-host member's request 404s at the verb, so the item cannot leak a
// visibility plane the requester can't already see. The two formats the route serves are two link items in
// one submenu. `.orb.json` (R6) is the FIDELITY container — the room whole, including the planes a
// transcript cannot carry (injections, room overrides, the tag overlay, the rpg campaign) — and is listed
// FIRST because it is what "export this chat" should mean by default; `.jsonl` is the ST/share transcript
// (both round-trip back through the band's Import); `.txt` is a read-only reading copy.
//
// REVERSIBILITY (DESIGN.md §9): rename/star/archive are quiet in-place edits; DELETE cascades hard
// (messages/roster/events, FK) — NOT reversible — so it sits behind RowActionsMenu's ConfirmDialog
// (never an undo-toast). Rename is a single controlled `Input` in a `Dialog` (the §13.4 "single rename
// stays controlled + Zod" carve-out — NOT a form factory).

import type { ChatId } from "@orb/kit/ids";
import { Archive, Download, Icon, Pencil, Star } from "@orb/ui/icons";
import { MenuItem, MenuLinkItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { RowActionsMenu } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useArchiveChat, useDeleteChat, useStarChat, useUpdateChatTitle } from "../hooks/use-chat-row-mutations.ts";
import { RenameChatDialog } from "./rename-chat-dialog.tsx";

/** The host-gated transcript download route (`GET /api/export/chat/:chatId`), one home for both formats. */
const EXPORT_CHAT_PATH = "/api/export/chat/";

export interface ChatListRowMenuProps {
  readonly chatId: ChatId;
  /** The row's current AUTHORED title (seeds the rename input) — null renders as an empty field. */
  readonly title: string | null;
  /** The row's DISAMBIGUATED name (`chatRowActionName` — derived display title + the stamp the row shows) —
   *  names the kebab trigger so the per-row menus are distinguishable, not N identical "Chat actions"
   *  (finding #4), and not N identical "Chat actions for Azarael" in her projection (side-eye P3a). */
  readonly rowName: string;
  readonly starred: boolean;
  readonly archived: boolean;
  /** Fired after a successful delete so the route can leave the room if it was the active one (J1). */
  readonly onDeleted?: ((chatId: ChatId) => void) | undefined;
}

/** The kebab menu + its rename/delete overlays for one chat-list row. */
export function ChatListRowMenu({ chatId, title, rowName, starred, archived, onDeleted }: ChatListRowMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const starChat = useStarChat({ trpc, invalidation });
  const archiveChat = useArchiveChat({ trpc, invalidation });
  const deleteChat = useDeleteChat({ trpc, invalidation });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

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
      <RowActionsMenu
        label={`Chat actions for ${rowName}`}
        reveal={true}
        destructive={{
          title: "Delete this chat?",
          description: "This permanently deletes the chat and its messages for everyone. This can't be undone.",
          onConfirm: confirmDelete,
        }}
      >
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
        <MenuSubmenuRoot>
          <MenuSubmenuTrigger>
            <Icon icon={Download} size="sm" />
            Export transcript
          </MenuSubmenuTrigger>
          <MenuPopup>
            <MenuLinkItem download={true} href={`${EXPORT_CHAT_PATH}${chatId}?format=orb`}>
              Whole room (.orb.json)
            </MenuLinkItem>
            <MenuLinkItem download={true} href={`${EXPORT_CHAT_PATH}${chatId}`}>
              Transcript (.jsonl)
            </MenuLinkItem>
            <MenuLinkItem download={true} href={`${EXPORT_CHAT_PATH}${chatId}?format=txt`}>
              Plain text (.txt)
            </MenuLinkItem>
          </MenuPopup>
        </MenuSubmenuRoot>
      </RowActionsMenu>

      {/* Rename — a single controlled input (the §13.4 single-rename carve-out, not a form factory). */}
      <RenameChatDialog open={renameOpen} onOpenChange={setRenameOpen} value={renameValue} onValueChange={setRenameValue} onSave={saveRename} />
    </>
  );
}
