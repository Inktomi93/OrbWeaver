// The chat options menu: registry-shaped over already-built verbs + store actions, so later features
// enter as rows, not rework. Unbuilt items are omitted — never a disabled stub pointing at nothing.
// #41 CONSOLIDATION: the turn actions (Continue / Regenerate / Impersonate) moved to the composer WAND —
// the guided-actions home, where the typed composer text optionally steers them; the ⋯ menu keeps only
// actions with no wand/panel home. Delete cascades hard, through an AlertDialog confirm, never an
// undo-toast.
//
// ONE MENU, NO PHASES (chat-creation-draft-mode-replacement.md §4.1, R1). This menu used to render twice:
// a `committed={false}` DRAFT rendered the IDENTICAL item set with rename/delete/select-messages DISABLED
// and a hover reason naming the unlock ("send the first message"), because those actions need a server row
// the room did not have. The room has one from the creation click, so every item is simply available and the
// #8 grey-out apparatus — the `committed` prop, the `draftKey` prop, the disabled Delete twin — is gone. The
// owner's show-everything ruling is UNCHANGED and still binds: nothing here hides, it just no longer has a
// phase to hide from.

import { isRpgEngaged, RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Icon, Images, MessagesSquare, Pencil, Swords, X } from "@orb/ui/icons";
import { MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, useGatedQuery, useInvalidation, useStartChat, useTRPC } from "#data";
import { enterSelectionMode, goToLanding } from "#state";
import { CharacterGalleryDialog } from "../anchors/character-gallery-dialog.tsx";
import { useDeleteChat, useUpdateChatTitle } from "../hooks/use-chat-row-mutations.ts";
import { RenameChatDialog } from "./rename-chat-dialog.tsx";

// The #40 GAME front-door mutations — the ⋯ menu's start/pause/resume rides the rpg procs DIRECTLY
// (lockdown §12 — a feature rides another domain's tRPC procedure directly, never its client; the rpg
// feature's own direct `trpc.chat.listMessages` read, `rpg-choice-echo.tsx`, is the live precedent). Both
// repaint `chat.getChat` (the pointer MIRROR the takeover gate + this menu read).
const useStartGame = createEntityMutation<inferInput<Trpc["rpg"]["createGame"]>, unknown>({
  options: (trpc) => trpc.rpg.createGame.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't start the game.",
});
const useSetGameEngaged = createEntityMutation<inferInput<Trpc["rpg"]["updateConfig"]>, unknown>({
  options: (trpc) => trpc.rpg.updateConfig.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't switch the game.",
});

// The overlay toggle labels — ONE easily-renamed home (owner naming may still move; never scatter).
const RPG_OVERLAY_ON_LABEL = "Turn on RPG";
const RPG_OVERLAY_OFF_LABEL = "Turn off RPG";

/** The "turn on RPG" submenu — the profile pick behind a FIRST-ever enable (freeform | d20). */
function TurnOnRpgSubmenu({ onPick }: { readonly onPick: (profile: "freeform" | "d20") => void }): ReactElement {
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger>
        <Icon icon={Swords} size="sm" />
        {RPG_OVERLAY_ON_LABEL}
      </MenuSubmenuTrigger>
      <MenuPopup>
        <MenuItem onClick={(): void => onPick("freeform")}>Freeform story</MenuItem>
        <MenuItem onClick={(): void => onPick("d20")}>D20 adventure</MenuItem>
      </MenuPopup>
    </MenuSubmenuRoot>
  );
}

/** The #40 RPG-overlay section of the ⋯ menu — ONE on/off toggle, flippable at ANY time (owner model:
 *  rpg-lite is an OVERLAY on the roleplay, not a game session; there is no pause/resume). Host-only (a
 *  member sees nothing — the server verbs re-gate). Arms:
 *   • no game — "Turn on RPG" (profile pick) → createGame.
 *   • overlay ON — "Turn off RPG" (state kept; assembly + panel drop the overlay).
 *   • overlay OFF — "Turn on RPG" (no re-pick — the preserved state comes back as-is).
 *
 *  The pre-send STAGING arm is gone (R1): a draft used to stage `startAsGame` into the draft-config store so
 *  the first send could mint the lite game BEFORE the opening turn. The room exists first now, so the toggle
 *  calls `rpg.createGame` directly — which is still before the first turn, because the first turn is always
 *  later than creation. */
function GameMenuSection({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const startGame = useStartGame({ trpc, invalidation });
  const setEngaged = useSetGameEngaged({ trpc, invalidation });
  const detailQuery = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  // OPTIONAL-CHAINED throughout: the CT harness resolves UNLISTED procs to `{data:null}` by design (an
  // incidental read must never crash a surface) — a bare `.viewerIsHost` deref here blanked the menu.
  const detail = detailQuery.data;
  if (detail?.viewerIsHost === false) {
    return null; // PERMISSION-omit: only the host flips the overlay (the server verbs re-gate).
  }

  const pointer = detail?.rpg ?? null;
  if (pointer === null) {
    // First-ever enable on a committed chat — the profile pick, then createGame.
    return (
      <TurnOnRpgSubmenu onPick={(profile): void => startGame.mutate({ chatId, mode: "lite", ...(profile === "d20" ? { profile: RPG_PROFILE_D20 } : {}) })} />
    );
  }
  const engaged = isRpgEngaged(pointer);
  const label = engaged ? RPG_OVERLAY_OFF_LABEL : RPG_OVERLAY_ON_LABEL;
  return (
    <MenuItem
      title={engaged ? "Turns the RPG overlay off — your sheets, scene, and quests are kept." : "Turns the RPG overlay back on — everything is as you left it."}
      onClick={(): void => setEngaged.mutate({ chatId, patch: { engaged: !engaged } })}
    >
      <Icon icon={Swords} size="sm" />
      {label}
    </MenuItem>
  );
}

interface ChatOptionsCastMember {
  readonly characterId: CharacterId;
  readonly name: string;
}

export interface ChatOptionsMenuProps {
  readonly chatId: ChatId;
  readonly title: string | null;
  /** Seeds "New chat with same cast" and the per-character gallery entries. */
  readonly characters: readonly ChatOptionsCastMember[];
}

export function ChatOptionsMenu({ chatId, title, characters }: ChatOptionsMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const deleteChat = useDeleteChat({ trpc, invalidation });
  // "New chat with same cast" is a CREATION, and creation is one shared client seam (`#data`), never a
  // store write that hands a rowless room to the chat surface.
  const { startChat } = useStartChat();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [galleryFor, setGalleryFor] = useState<ChatOptionsCastMember | null>(null);

  const characterIds = characters.map((c) => c.characterId);
  const soloCharacter = characters.length === 1 ? characters[0] : undefined;

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
        goToLanding();
      } catch {
        // The mutation's own errorToast already surfaced it; stay on the chat.
      }
    })();
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
          <MenuItem onClick={(): void => void startChat({ characterIds })}>
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
        {/* The #40 RPG-overlay toggle — on/off at ANY time. */}
        <GameMenuSection chatId={chatId} />

        {/* #41 consolidation — Continue/Regenerate/Impersonate moved to the composer WAND (the
            guided-actions home; composer text optional there). The ⋯ menu keeps only actions with no
            wand/panel home. */}
        {/* IA de-dup (owner rule: an option that has a CONTEXT-panel home does NOT belong in the three dots).
            Removed here because each is already a context-panel tab/section: Chat settings (Settings tab),
            Preview request (Preview tab), Injections (Injections tab), and Invite / Hand off host / Leave
            (all in the Members tab's roster admin). Message selection has NO panel home, so it stays. */}
        <MenuItem onClick={enterSelectionMode}>Select messages…</MenuItem>

        <MenuSeparator />
        <TrailingItems onRename={openRename} />
      </RowActionsMenu>

      <RenameChatDialog open={renameOpen} onOpenChange={setRenameOpen} value={renameValue} onValueChange={setRenameValue} onSave={saveRename} />

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

/** The trailing group — Rename / Close chat. Extracted so the parent menu stays under the complexity
 *  ceiling. Delete is the confirm-wired `destructive` slot on `RowActionsMenu`.
 *
 *  EXPORT IS DELIBERATELY ABSENT: transcript download homes on the chats-LIST row kebab, its ONE home
 *  (the ratified lifecycle placement — the room carries no import/export chrome). */
function TrailingItems({ onRename }: { readonly onRename: () => void }): ReactElement {
  return (
    <>
      <MenuItem onClick={onRename}>
        <Icon icon={Pencil} size="sm" />
        Rename
      </MenuItem>
      <MenuItem onClick={goToLanding}>
        <Icon icon={X} size="sm" />
        Close chat
      </MenuItem>
    </>
  );
}
