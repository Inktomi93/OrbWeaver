// The chat OPTIONS menu (⋯) — the J3 identity header's chat-level action cluster (ux-flow-revamp J6; NT
// `chat-options-menu.tsx` parity). Registry-shaped over ALREADY-BUILT verbs + store actions, so later
// features enter as ROWS, not rework. Unbuilt NT items (per-chat persona, similar chats, persistent
// guides) are OMITTED — never a disabled stub pointing at nothing (§4.3 rule 1: no dead ends).
//
// The turn actions (Continue · Regenerate · Impersonate) reuse `useGuidedActions` (the composer wand's
// own dispatch) with an EMPTY steer — from the header there is no draft text, so `useGuidedActions` OMITS
// the `guided` object entirely (FINAL-Chat-Tab-Redesign §6.4: an empty `input` would resolve a dangling
// template scaffold server-side; a plain turn sends no steer), giving the plain continue/reroll/impersonate
// (rule 10: same verb, same home, second entry point). Continue/Regenerate
// gate on a tail assistant slot (the wand's own `tailAssistantMessageId` gate). Rename is a single
// controlled input (the §13.4 single-rename carve-out, the ChatListRowMenu precedent); Delete cascades
// hard → an AlertDialog confirm (never an undo-toast, DESIGN.md §9), then `goToLanding` (the deleted
// chat's id would 404). The context-tab items jump the CONTEXT panel to a tab via the shell `contextTab`
// seam + dock it. Bulk "Select messages…" lands with the J6 selection-bar wiring (a later row here).

import { GUIDED_IMPERSONATE_PERSONS } from "@orb/contracts/preset";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the chat-list-row-menu.tsx precedent).
import { Icon, Images, MessagesSquare, MoreHorizontal, Pencil, Trash2, X } from "@orb/ui/icons";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import {
  committedChat,
  enterSelectionMode,
  goToLanding,
  setContextTab,
  setPanelMode,
  startNewChat,
} from "#state";
import { CharacterGalleryDialog } from "../anchors/character-gallery-dialog";
import { useDeleteChat, useUpdateChatTitle } from "../hooks/use-chat-row-mutations";
import { useGuidedActions } from "../hooks/use-guided-actions";
import { RenameChatDialog } from "./rename-chat-dialog";

/** One character in the chat's cast — id + resolved display name (seeds the per-character gallery entry). */
export interface ChatOptionsCastMember {
  readonly characterId: CharacterId;
  readonly name: string;
}

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
  /** The chat's character cast (id + name) — seeds "New chat with same cast" AND the per-character gallery
   *  entries (empty for a solo assistant). */
  readonly characters: readonly ChatOptionsCastMember[];
  /** Whether the viewer is the host — gates the Preview-request jump (host-only server-side). */
  readonly isHost: boolean;
}

/** The ⋯ chat-options menu for the active chat's identity header. */
export function ChatOptionsMenu({
  chatId,
  title,
  characters,
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
  const [galleryFor, setGalleryFor] = useState<ChatOptionsCastMember | null>(null);

  const characterIds = characters.map((c) => c.characterId);
  // A solo cast gets a direct "[Name]'s gallery" row; a group gets a submenu (below).
  const soloCharacter = characters.length === 1 ? characters[0] : undefined;

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
          {soloCharacter !== undefined ? (
            <MenuItem onClick={(): void => setGalleryFor(soloCharacter)}>
              <Icon icon={Images} size="sm" />
              {soloCharacter.name}'s gallery
            </MenuItem>
          ) : null}
          {characters.length > 1 ? (
            <MenuSubmenuRoot>
              <MenuSubmenuTrigger>
                <Icon icon={Images} size="sm" />
                Character galleries
              </MenuSubmenuTrigger>
              <MenuPopup>
                {characters.map((character) => (
                  <MenuItem
                    key={character.characterId}
                    onClick={(): void => setGalleryFor(character)}
                  >
                    {character.name}
                  </MenuItem>
                ))}
              </MenuPopup>
            </MenuSubmenuRoot>
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
      <RenameChatDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        value={renameValue}
        onValueChange={setRenameValue}
        onSave={saveRename}
      />

      {/* Delete — a hard, non-reversible cascade → an explicit confirm (never an undo-toast). */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this chat?"
        description="This permanently deletes the chat and its messages for everyone. This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />

      {/* The per-character gallery modal (grid + lightbox + add-picker), opened from the entries above. */}
      {galleryFor === null ? null : (
        <CharacterGalleryDialog
          open={true}
          onOpenChange={(next): void => {
            if (!next) {
              setGalleryFor(null);
            }
          }}
          characterId={galleryFor.characterId}
          characterName={galleryFor.name}
        />
      )}
    </>
  );
}
