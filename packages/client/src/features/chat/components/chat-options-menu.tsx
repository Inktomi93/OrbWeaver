// The chat options menu: registry-shaped over already-built verbs + store actions, so later features
// enter as rows, not rework. Unbuilt items are omitted — never a disabled stub pointing at nothing.
// #41 CONSOLIDATION: the turn actions (Continue / Regenerate / Impersonate) moved to the composer WAND —
// the guided-actions home, where the typed composer text optionally steers them; the ⋯ menu keeps only
// actions with no wand/panel home. Delete cascades hard, through an AlertDialog confirm, never an
// undo-toast.
//
// ONE MENU, NO PHASES (D166). This menu used to render twice:
// a `committed={false}` DRAFT rendered the IDENTICAL item set with rename/delete/select-messages DISABLED
// and a hover reason naming the unlock ("send the first message"), because those actions need a server row
// the room did not have. The room has one from the creation click, so every item is simply available and the
// #8 grey-out apparatus — the `committed` prop, the `draftKey` prop, the disabled Delete twin — is gone. The
// owner's show-everything ruling is UNCHANGED and still binds: nothing here hides, it just no longer has a
// phase to hide from.

import { isRpgEngaged } from "@orb/contracts/rpg";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Icon, Images, ListChecks, MessagesSquare, Pencil, Swords, X } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, useGatedQuery, useInvalidation, useStartChat, useTRPC } from "#data";
import { enterSelectionMode, GAME_MODE_KEPT_LINE, GAME_MODE_OFF_LABEL, GAME_MODE_ON_LABEL, goToLanding, onGameModeStarted, onGameModeStopped } from "#state";
import { CharacterGalleryDialog } from "../anchors/character-gallery-dialog.tsx";
import { useDeleteChat, useUpdateChatTitle } from "../hooks/use-chat-row-mutations.ts";
import { RenameChatDialog } from "./rename-chat-dialog.tsx";

// The #40 GAME front-door mutations — the ⋯ menu's start/stop rides the rpg procs DIRECTLY
// (lockdown §12 — a feature rides another domain's tRPC procedure directly, never its client; the rpg
// feature's own direct `trpc.chat.listMessages` read, `rpg-choice-echo.tsx`, is the live precedent). Both
// repaint `chat.getChat` (the pointer MIRROR the takeover gate + this menu read) AND `chat.listChats`:
// the LIST row renders the same fact from a different read (`isGame`/`gamePaused`, derived server-side off
// the same pointer), so leaving it out left the ⚔ marker claiming "Game chat" for the rest of the session
// while the room's own pane said otherwise — measured at t+0 and t+2000 ms (#863 P2). A mutation's
// invalidation set is a UX surface: it must name EVERY read that renders the toggled fact.
const useStartGame = createEntityMutation<inferInput<Trpc["rpg"]["createGame"]>, unknown>({
  options: (trpc) => trpc.rpg.createGame.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId }), trpc.chat.listChats.queryFilter()],
  errorToast: "Couldn't start the game.",
});
const useSetGameEngaged = createEntityMutation<inferInput<Trpc["rpg"]["updateConfig"]>, unknown>({
  options: (trpc) => trpc.rpg.updateConfig.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId }), trpc.chat.listChats.queryFilter()],
  errorToast: "Couldn't switch the game.",
});

/** The #40/#862 GAME-MODE section of the ⋯ menu — ONE toggle, flippable at ANY time (owner model: a game
 *  is a mode the roleplay runs in, not a session with pause/resume). Host-only (a member sees nothing — the
 *  server verbs re-gate). Arms:
 *   • no game — "Turn on game mode" → `createGame` DIRECTLY (no pick).
 *   • game ON — "Turn off game mode" + the kept-state line (state preserved; assembly + panel drop it).
 *   • game OFF — "Turn on game mode" (the preserved state comes back as-is).
 *
 *  ONE ACTION, NOT A PICK (#862, owner ruling 2026-08-30). This item used to be a SUBMENU offering
 *  `Freeform story | D20 adventure` — two buttons that minted the identical `lite` game and differed only
 *  by packaged profile. That is a SETTING, and it lives on the Game tab's host console now (`ruleset`,
 *  retunable additively at any time), so starting is one click from one item. The submenu's keyboard model
 *  was CORRECT, not broken (measured: haspopup/expanded, ArrowRight-open, Escape-restores-focus,
 *  `:focus-visible` at every stop) — what replaces it keeps that standard by being an ordinary MenuItem,
 *  the same roving-focus surface with one less level.
 *
 *  THE COPY IS ON THE ITEM, NOT IN A TOOLTIP (#863 P1). The reassurance used to live in a native `title`:
 *  dwell-gated on a pointer, absent on touch entirely, and only a DESCRIPTION to a screen reader. It is a
 *  visible second line now, wired as the item's accessible description, with the accessible NAME pinned to
 *  the first line by `aria-labelledby` (textContent would otherwise fold both lines into the name).
 *
 *  THE PENDING TREATMENT IS THE DOOR'S (#863 P2): a `createAdmission` ref admits ONE write per task and the
 *  item disables while it is in flight — the menu used to close instantly with ~380 ms of work at 4× CPU
 *  and nothing indicating it. A transient disable carries no reason (only persistent gates explain
 *  themselves). */
function GameMenuSection({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const startGame = useStartGame({ trpc, invalidation });
  const setEngaged = useSetGameEngaged({ trpc, invalidation });
  const detailQuery = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const admission = useRef(false);
  const labelId = useId();
  const descriptionId = useId();
  // OPTIONAL-CHAINED throughout: the CT harness resolves UNLISTED procs to `{data:null}` by design (an
  // incidental read must never crash a surface) — a bare `.viewerIsHost` deref here blanked the menu.
  const detail = detailQuery.data;
  if (detail?.viewerIsHost === false) {
    return null; // PERMISSION-omit: only the host flips game mode (the server verbs re-gate).
  }

  const pointer = detail?.rpg ?? null;
  const engaged = isRpgEngaged(pointer);
  const pending = startGame.isPending || setEngaged.isPending;
  // The admission ref is the door's own idiom: two same-task activations (double-click, Enter+click) must
  // produce ONE write, and `isPending` alone cannot see the second one inside the same task.
  const admit = (run: () => void): void => {
    if (admission.current) {
      return;
    }
    admission.current = true;
    run();
  };
  const settled = (): void => {
    admission.current = false;
  };
  const start = (): void =>
    admit(() =>
      // No `ruleset`: a game is born freeform and the host retunes the SETTING on the Game tab (#862). The
      // reveal + announcement fire on the COMMIT, so nothing is claimed before the server agrees.
      startGame.mutate({ chatId, mode: "lite" }, { onSuccess: onGameModeStarted, onSettled: settled }),
    );
  const setMode = (next: boolean): void =>
    admit(() => setEngaged.mutate({ chatId, patch: { engaged: next } }, { onSuccess: next ? onGameModeStarted : onGameModeStopped, onSettled: settled }));

  if (!engaged) {
    return (
      <>
        <MenuSeparator />
        <MenuItem disabled={pending} onClick={(): void => (pointer === null ? start() : setMode(true))}>
          <Icon icon={Swords} size="sm" />
          {GAME_MODE_ON_LABEL}
        </MenuItem>
        <MenuSeparator />
      </>
    );
  }
  return (
    <>
      {/* Its OWN separator group (#863 P1): the toggle used to sit unseparated between two cosmetic items
          while the strictly-less-surprising Delete got a separator, an icon and a confirm dialog. */}
      <MenuSeparator />
      <MenuItem aria-describedby={descriptionId} aria-labelledby={labelId} disabled={pending} onClick={(): void => setMode(false)}>
        <Icon icon={Swords} size="sm" />
        <Stack gap="tight">
          <span id={labelId}>{GAME_MODE_OFF_LABEL}</span>
          {/* The kept-state promise, at the moment of the decision — this is what makes the action read as
              PAUSE rather than END, which is why no confirm dialog is offered (it is reversible). */}
          <Text id={descriptionId} voice="gloss">
            {GAME_MODE_KEPT_LINE}
          </Text>
        </Stack>
      </MenuItem>
      <MenuSeparator />
    </>
  );
}

interface ChatOptionsCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
}

export interface ChatOptionsMenuProps {
  readonly chatId: ChatId;
  readonly title: string | null;
  /** Seeds "New chat with the same characters" and the per-character gallery entries. */
  readonly characters: readonly ChatOptionsCharacter[];
}

export function ChatOptionsMenu({ chatId, title, characters }: ChatOptionsMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const deleteChat = useDeleteChat({ trpc, invalidation });
  // "New chat with the same characters" is a CREATION, and creation is one shared client seam (`#data`), never a
  // store write that hands a rowless room to the chat surface.
  const { startChat } = useStartChat();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [galleryFor, setGalleryFor] = useState<ChatOptionsCharacter | null>(null);

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
    deleteChat.mutate({ chatId }, { onSuccess: goToLanding });
  };
  return (
    <>
      <RowActionsMenu
        label="Chat options"
        // The hover/focus explanation is the LABEL, not a twin of it (#869): the popup used to read "Manage
        // this chat" over an accessible name of "Chat options", and on an icon-only trigger the popup IS the
        // visible label — WCAG 2.5.3, so the words a voice-control user could see did not reach the room's
        // only game door. `tooltip` is a boolean now; the divergence is unrepresentable.
        tooltip={true}
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
            New chat with the same characters
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
        {/* The #40/#862 GAME-MODE toggle — on/off at ANY time, in its own separator group. */}
        <GameMenuSection chatId={chatId} />

        {/* #41 consolidation — Continue/Regenerate/Impersonate moved to the composer WAND (the
            guided-actions home; composer text optional there). The ⋯ menu keeps only actions with no
            wand/panel home. */}
        {/* IA de-dup (owner rule: an option that has a CONTEXT-panel home does NOT belong in the three dots).
            Removed here because each is already a context-panel tab/section: Chat settings (Settings tab),
            Preview request (Preview tab), Injections (Injections tab), and Invite / Hand off host / Leave
            (all in the Members tab's roster admin). Message selection has NO panel home, so it stays. */}
        {/* `ListChecks` is the house's EXISTING selection-mode glyph — the config collection band's bulk-select
            toggle wears it (`config-list-collection-group.tsx`), and one verb takes one glyph. This item was the
            only one in the menu with no icon (#869), leaving a hole in the glyph column directly under the game
            row, which is where the eye lands after it. */}
        <MenuItem onClick={enterSelectionMode}>
          <Icon icon={ListChecks} size="sm" />
          Select messages…
        </MenuItem>

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
