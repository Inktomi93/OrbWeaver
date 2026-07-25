// The chat options menu: registry-shaped over already-built verbs + store actions, so later features
// enter as rows, not rework. Unbuilt items are omitted — never a disabled stub pointing at nothing. The
// turn actions reuse useGuidedActions (the composer wand's own dispatch) with an empty steer, giving
// the plain continue/reroll/impersonate. Delete cascades hard, through an AlertDialog confirm, never an
// undo-toast.
//
// ONE menu across draft + committed (#8 — the not-yet-ready state renders the SAME options surface with
// the unavailable actions DISABLED, never a vanished/parallel reduced menu, and never HIDDEN): a
// `committed={false}` DRAFT (no server row yet) renders the IDENTICAL item set to a committed chat. The
// omit-doctrine is OVERRIDDEN for PHASE-gated items (owner ruling 2026-07-24: "i fucking hate things
// hiding") — every action that becomes available on commit still RENDERS on a draft, DISABLED, with a
// hover reason that NAMES the unlock condition (send the first message). A draft CAN do the actions that
// don't need canon (open its Settings/Injections context tabs, start a fresh chat with the same cast,
// browse a founding character's gallery), so those stay live; everything else (turn steering, membership,
// rename/download/delete of a row not yet created) is disabled-with-reason. `title` on a MenuItem surfaces
// on hover because Base UI renders a div[role=menuitem] aria-disabled (not native-disabled), so a disabled
// item still receives pointer/hover — verified in chat-options-menu.ct.tsx.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Crown, Download, Icon, Images, LogOut, MessagesSquare, Pencil, Trash2, UserPlus, X } from "@orb/ui/icons";
import { MenuItem, MenuLinkItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, RowActionsMenu } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { ChatContextTabId } from "#lib";
import { DRAFT_UNLOCK_AFTER_SEND, NEEDS_ASSISTANT_REPLY } from "#lib";
import { committedChat, draftChat, enterSelectionMode, goToLanding, setContextTab, setPanelMode, startNewChat } from "#state";
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
  /** Absent for a DRAFT (no server row yet) — committed-only actions disable, canon-less actions stay live. */
  readonly chatId?: ChatId | undefined;
  /** False ⇒ a DRAFT (the not-yet-committed twin of this same menu). @defaultValue true */
  readonly committed?: boolean;
  readonly title: string | null;
  /** Seeds "New chat with same cast" and the per-character gallery entries. */
  readonly characters: readonly ChatOptionsCastMember[];
  readonly isHost: boolean;
  /** Gates the membership rows; single-user installs render none of them. */
  readonly multiHumanCapable?: boolean;
}

export function ChatOptionsMenu({ chatId, committed = true, title, characters, isHost, multiHumanCapable = false }: ChatOptionsMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const deleteChat = useDeleteChat({ trpc, invalidation });
  const selfLeave = useSelfLeave({ trpc, invalidation });
  // A draft has no chatId; the guided fires early-return on a null chatId, so the menu items disable anyway.
  const guided = useGuidedActions({ handle: chatId === undefined ? draftChat("chat-options-draft") : committedChat(chatId) });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [galleryFor, setGalleryFor] = useState<ChatOptionsCastMember | null>(null);

  const characterIds = characters.map((c) => c.characterId);
  const soloCharacter = characters.length === 1 ? characters[0] : undefined;

  // Canon-requiring actions disable on a draft; the tail-assistant gate additionally disables swipe/continue.
  const canTargetTail = committed && guided.tailAssistantMessageId !== null;
  // Every disabled item names its unlock condition on hover (owner: "when it's disabled on hover tell why").
  // draftReason = the generic "send the first message" unlock (undefined on a committed chat — no tooltip);
  // tailReason = the turn-steering unlock (draft OR committed-with-no-assistant-tail need an assistant reply).
  const draftReason = committed ? undefined : DRAFT_UNLOCK_AFTER_SEND;
  const tailReason = canTargetTail ? undefined : (draftReason ?? NEEDS_ASSISTANT_REPLY);

  const openRename = (): void => {
    setRenameValue(title ?? "");
    setRenameOpen(true);
  };
  const saveRename = (): void => {
    if (chatId === undefined) {
      return;
    }
    const trimmed = renameValue.trim();
    updateTitle.mutate({ chatId, title: trimmed === "" ? null : trimmed });
    setRenameOpen(false);
  };
  const confirmLeave = (): void => {
    if (chatId === undefined) {
      return;
    }
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
    if (chatId === undefined) {
      return;
    }
    void (async (): Promise<void> => {
      try {
        await deleteChat.mutateAsync({ chatId });
        goToLanding();
      } catch {
        // The mutation's own errorToast already surfaced it; stay on the chat.
      }
    })();
  };
  const openContextTab = (tab: ChatContextTabId): void => {
    setContextTab(tab);
    setPanelMode("context", "docked");
  };

  return (
    <>
      <RowActionsMenu
        label="Chat options"
        // Committed: the confirm-wired destructive item. Draft: rendered as a plain DISABLED "Delete chat"
        // item in the trailing group below (same label, same position, with a reason) — the item is never
        // hidden (owner ruling), and RowActionsMenu's destructive slot can't render disabled, so the draft
        // arm renders it as an ordinary disabled MenuItem instead.
        {...(committed
          ? {
              destructive: {
                label: "Delete chat",
                separator: false,
                title: "Delete this chat?",
                description: "This permanently deletes the chat and its messages for everyone. This can't be undone.",
                confirmLabel: "Delete",
                onConfirm: confirmDelete,
              },
            }
          : {})}
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
        {/* Turn steering needs an assistant reply to work on — disabled (with the tail reason) on a draft
            OR a committed chat whose latest turn isn't an assistant reply. Same items, never removed. */}
        <MenuItem disabled={!canTargetTail} title={tailReason} onClick={(): void => guided.fireContinue("")}>
          Continue
        </MenuItem>
        <MenuItem disabled={!canTargetTail} title={tailReason} onClick={(): void => guided.fireSwipe("")}>
          Regenerate
        </MenuItem>
        <ImpersonateSubmenu disabled={!committed} reason={draftReason} onPick={(person): void => guided.fireImpersonate("", person)} />

        <MenuSeparator />
        <MembershipItems
          isHost={isHost}
          multiHumanCapable={multiHumanCapable}
          disabled={!committed}
          reason={draftReason}
          onInvite={(): void => setInviteOpen(true)}
          onHandOff={(): void => openContextTab("members")}
          onLeave={(): void => setLeaveOpen(true)}
        />
        {multiHumanCapable ? <MenuSeparator /> : null}
        {/* Message selection needs canon rows — disabled on a draft. Overrides/Injections edit the DRAFT
            config pre-commit (the context tabs are the unified draft twin), so they stay live either phase. */}
        <MenuItem disabled={!committed} title={draftReason} onClick={enterSelectionMode}>
          Select messages…
        </MenuItem>
        <MenuItem onClick={(): void => openContextTab("settings")}>Chat settings…</MenuItem>
        {isHost ? (
          <MenuItem disabled={!committed} title={draftReason} onClick={(): void => openContextTab("preview")}>
            Preview request…
          </MenuItem>
        ) : null}
        <MenuItem onClick={(): void => openContextTab("injections")}>Injections…</MenuItem>

        <MenuSeparator />
        <TrailingItems committed={committed} chatId={chatId} reason={draftReason} onRename={openRename} />
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

      {isHost && multiHumanCapable && chatId !== undefined ? <InviteDialog chatId={chatId} open={inviteOpen} onOpenChange={setInviteOpen} /> : null}

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

interface MembershipItemsProps {
  readonly isHost: boolean;
  readonly multiHumanCapable: boolean;
  /** Disabled (with a reason) on a draft — membership acts on a committed room. */
  readonly disabled: boolean;
  readonly reason: string | undefined;
  readonly onInvite: () => void;
  readonly onHandOff: () => void;
  readonly onLeave: () => void;
}

/** The multi-human membership rows (invite / hand-off host / leave), extracted so the parent menu stays
 *  under the complexity ceiling. Single-user installs render none of them (`multiHumanCapable` false). */
function MembershipItems({ isHost, multiHumanCapable, disabled, reason, onInvite, onHandOff, onLeave }: MembershipItemsProps): ReactElement | null {
  if (!multiHumanCapable) {
    return null;
  }
  return (
    <>
      {isHost ? (
        <MenuItem disabled={disabled} title={reason} onClick={onInvite}>
          <Icon icon={UserPlus} size="sm" />
          Invite people…
        </MenuItem>
      ) : null}
      {isHost ? (
        <MenuItem disabled={disabled} title={reason} onClick={onHandOff}>
          <Icon icon={Crown} size="sm" />
          Hand off host…
        </MenuItem>
      ) : null}
      {!isHost ? (
        <MenuItem disabled={disabled} title={reason} onClick={onLeave}>
          <Icon icon={LogOut} size="sm" />
          Leave chat
        </MenuItem>
      ) : null}
    </>
  );
}

interface TrailingItemsProps {
  readonly committed: boolean;
  readonly chatId: ChatId | undefined;
  readonly reason: string | undefined;
  readonly onRename: () => void;
}

/** The trailing group — Rename / Download transcript / Close chat, plus (draft only) a DISABLED "Delete
 *  chat" twin. Extracted so the parent menu stays under the complexity ceiling. Rename + Download disable
 *  on a draft (with a reason); Download is a real download LINK only when committed (a draft has no href
 *  referent, so it renders a disabled MenuItem instead). Delete is the confirm-wired `destructive` slot
 *  when committed — a draft renders it here, disabled, so the item is never hidden (owner ruling). */
function TrailingItems({ committed, chatId, reason, onRename }: TrailingItemsProps): ReactElement {
  return (
    <>
      <MenuItem disabled={!committed} title={reason} onClick={onRename}>
        <Icon icon={Pencil} size="sm" />
        Rename
      </MenuItem>
      {committed && chatId !== undefined ? (
        <MenuLinkItem href={`/api/export/chat/${chatId}`} download={true}>
          <Icon icon={Download} size="sm" />
          Download transcript
        </MenuLinkItem>
      ) : (
        <MenuItem disabled={true} title={reason}>
          <Icon icon={Download} size="sm" />
          Download transcript
        </MenuItem>
      )}
      <MenuItem onClick={goToLanding}>
        <Icon icon={X} size="sm" />
        Close chat
      </MenuItem>
      {/* A draft renders the DISABLED Delete twin here (committed gets it via RowActionsMenu's destructive
          slot, which can't render disabled). Never hidden — same label + position, with a reason. */}
      {committed ? null : (
        <MenuItem disabled={true} title={reason}>
          <Icon icon={Trash2} size="sm" />
          Delete chat
        </MenuItem>
      )}
    </>
  );
}
