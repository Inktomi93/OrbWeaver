// The chat options menu: registry-shaped over already-built verbs + store actions, so later features
// enter as rows, not rework. Unbuilt items are omitted — never a disabled stub pointing at nothing. The
// turn actions reuse useGuidedActions (the composer wand's own dispatch) with an empty steer, giving
// the plain continue/reroll/impersonate. Delete cascades hard, through an AlertDialog confirm, never an
// undo-toast.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Crown, Download, Icon, Images, LogOut, MessagesSquare, Pencil, UserPlus, X } from "@orb/ui/icons";
import { MenuItem, MenuLinkItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, RowActionsMenu } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { committedChat, enterSelectionMode, goToLanding, setContextTab, setPanelMode, startNewChat } from "#state";
import { CharacterGalleryDialog } from "../anchors/character-gallery-dialog";
import { useDeleteChat, useUpdateChatTitle } from "../hooks/use-chat-row-mutations";
import { useGuidedActions } from "../hooks/use-guided-actions";
import { useSelfLeave } from "../hooks/use-membership-mutations";
import { ImpersonateSubmenu } from "./impersonate-submenu";
import { InviteDialog } from "./invite-dialog";
import { RenameChatDialog } from "./rename-chat-dialog";

interface ChatOptionsCastMember {
  readonly characterId: CharacterId;
  readonly name: string;
}

export interface ChatOptionsMenuProps {
  readonly chatId: ChatId;
  readonly title: string | null;
  /** Seeds "New chat with same cast" and the per-character gallery entries. */
  readonly characters: readonly ChatOptionsCastMember[];
  readonly isHost: boolean;
  /** Gates the membership rows; single-user installs render none of them. */
  readonly multiHumanCapable?: boolean;
}

export function ChatOptionsMenu({ chatId, title, characters, isHost, multiHumanCapable = false }: ChatOptionsMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const deleteChat = useDeleteChat({ trpc, invalidation });
  const selfLeave = useSelfLeave({ trpc, invalidation });
  const guided = useGuidedActions({ handle: committedChat(chatId) });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [galleryFor, setGalleryFor] = useState<ChatOptionsCastMember | null>(null);

  const characterIds = characters.map((c) => c.characterId);
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
  const confirmLeave = (): void => {
    void (async (): Promise<void> => {
      try {
        await selfLeave.mutateAsync({ chatId });
        goToLanding();
      } catch {
        // The mutation's own errorToast already surfaced it; stay in the chat.
      }
    })();
  };
  const confirmDelete = (): void => {
    void (async (): Promise<void> => {
      try {
        await deleteChat.mutateAsync({ chatId });
        goToLanding();
      } catch {
        // The mutation's own errorToast already surfaced it; stay on the chat.
      }
    })();
  };
  const openContextTab = (tab: string): void => {
    setContextTab(tab);
    setPanelMode("context", "docked");
  };

  return (
    <>
      <RowActionsMenu
        label="Chat options"
        destructive={{
          label: "Delete chat",
          separator: false,
          title: "Delete this chat?",
          description: "This permanently deletes the chat and its messages for everyone. This can't be undone.",
          confirmLabel: "Delete",
          onConfirm: confirmDelete,
        }}
      >
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
                <MenuItem key={character.characterId} onClick={(): void => setGalleryFor(character)}>
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
        <ImpersonateSubmenu onPick={(person): void => guided.fireImpersonate("", person)} />

        <MenuSeparator />
        {isHost && multiHumanCapable ? (
          <MenuItem onClick={(): void => setInviteOpen(true)}>
            <Icon icon={UserPlus} size="sm" />
            Invite people…
          </MenuItem>
        ) : null}
        {isHost && multiHumanCapable ? (
          <MenuItem onClick={(): void => openContextTab("members")}>
            <Icon icon={Crown} size="sm" />
            Hand off host…
          </MenuItem>
        ) : null}
        {!isHost && multiHumanCapable ? (
          <MenuItem onClick={(): void => setLeaveOpen(true)}>
            <Icon icon={LogOut} size="sm" />
            Leave chat
          </MenuItem>
        ) : null}
        {multiHumanCapable ? <MenuSeparator /> : null}
        <MenuItem onClick={enterSelectionMode}>Select messages…</MenuItem>
        <MenuItem onClick={(): void => openContextTab("overrides")}>Chat overrides…</MenuItem>
        {isHost ? <MenuItem onClick={(): void => openContextTab("preview")}>Preview request…</MenuItem> : null}
        <MenuItem onClick={(): void => openContextTab("injections")}>Injections…</MenuItem>

        <MenuSeparator />
        <MenuItem onClick={openRename}>
          <Icon icon={Pencil} size="sm" />
          Rename
        </MenuItem>
        <MenuLinkItem href={`/api/export/chat/${chatId}`} download={true}>
          <Icon icon={Download} size="sm" />
          Download transcript
        </MenuLinkItem>
        <MenuItem onClick={goToLanding}>
          <Icon icon={X} size="sm" />
          Close chat
        </MenuItem>
      </RowActionsMenu>

      <RenameChatDialog open={renameOpen} onOpenChange={setRenameOpen} value={renameValue} onValueChange={setRenameValue} onSave={saveRename} />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Leave this chat?"
        description="You'll lose access until someone invites you again. Your messages stay."
        confirmLabel="Leave"
        onConfirm={confirmLeave}
      />

      {isHost && multiHumanCapable ? <InviteDialog chatId={chatId} open={inviteOpen} onOpenChange={setInviteOpen} /> : null}

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
