// The chat options menu: registry-shaped over already-built verbs + store actions, so later features
// enter as rows, not rework. Unbuilt items are omitted — never a disabled stub pointing at nothing.
// #41 CONSOLIDATION: the turn actions (Continue / Regenerate / Impersonate) moved to the composer WAND —
// the guided-actions home, where the typed composer text optionally steers them; the ⋯ menu keeps only
// actions with no wand/panel home. Delete cascades hard, through an AlertDialog confirm, never an
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
// rename/delete of a row not yet created) is disabled-with-reason. `title` on a MenuItem surfaces
// on hover because Base UI renders a div[role=menuitem] aria-disabled (not native-disabled), so a disabled
// item still receives pointer/hover — verified in chat-options-menu.ct.tsx.

import { isRpgEngaged, RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Icon, Images, MessagesSquare, Pencil, Swords, Trash2, X } from "@orb/ui/icons";
import { MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { DRAFT_UNLOCK_AFTER_SEND } from "#lib";
import { enterSelectionMode, goToLanding, setDraftStartAsGame, startNewChat, useDraftConfig } from "#state";
import { CharacterGalleryDialog } from "../anchors/character-gallery-dialog";
import { useDeleteChat, useUpdateChatTitle } from "../hooks/use-chat-row-mutations";
import { RenameChatDialog } from "./rename-chat-dialog";

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

/** The "turn on RPG" submenu — the profile pick behind a FIRST-ever enable (freeform | d20). Both the
 *  draft arm (stages the intent) and the committed no-game arm (createGame) render this one shape. */
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
 *   • DRAFT — "Turn on RPG" stages the intent (the first send mints the game BEFORE the opening turn, so
 *     turn 1 is in-game); staged ⇒ "Turn off RPG" clears it. A pre-canon decision — never draft-disabled.
 *   • committed, no game — "Turn on RPG" (profile pick) → createGame.
 *   • committed, overlay ON — "Turn off RPG" (state kept; assembly + panel drop the overlay).
 *   • committed, overlay OFF — "Turn on RPG" (no re-pick — the preserved state comes back as-is). */
function GameMenuSection({
  chatId,
  committed,
  draftKey,
}: {
  readonly chatId: ChatId | undefined;
  readonly committed: boolean;
  readonly draftKey: string | undefined;
}): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const startGame = useStartGame({ trpc, invalidation });
  const setEngaged = useSetGameEngaged({ trpc, invalidation });
  const detailQuery = useGatedQuery(chatId ?? null, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  // Hooks run unconditionally (rules-of-hooks): the draft arm subscribes to its config; "" reads the
  // frozen empty config on a committed chat (no draftKey).
  const draftConfig = useDraftConfig(draftKey ?? "");
  // OPTIONAL-CHAINED throughout: the CT harness resolves UNLISTED procs to `{data:null}` by design (an
  // incidental read must never crash a surface) — a bare `.viewerIsHost` deref here blanked the menu.
  const detail = detailQuery.data;
  if (detail?.viewerIsHost === false) {
    return null; // PERMISSION-omit: only the host flips the overlay (the server verbs re-gate).
  }

  // DRAFT arm — stage/clear the intent locally; the first send carries it (`DraftCarry.startAsGame`).
  if (!committed && draftKey !== undefined) {
    if (draftConfig.startAsGame !== undefined) {
      return (
        <MenuItem
          title="RPG is staged — it turns on with your first message. Click to turn it off."
          onClick={(): void => setDraftStartAsGame(draftKey, undefined)}
        >
          <Icon icon={Swords} size="sm" />
          {RPG_OVERLAY_OFF_LABEL}
        </MenuItem>
      );
    }
    return <TurnOnRpgSubmenu onPick={(profile): void => setDraftStartAsGame(draftKey, profile === "d20" ? { profile: RPG_PROFILE_D20 } : {})} />;
  }
  if (chatId === undefined) {
    return null; // a landing/keyless surface — nothing to toggle against
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
  /** Absent for a DRAFT (no server row yet) — committed-only actions disable, canon-less actions stay live. */
  readonly chatId?: ChatId | undefined;
  /** False ⇒ a DRAFT (the not-yet-committed twin of this same menu). @defaultValue true */
  readonly committed?: boolean;
  readonly title: string | null;
  /** Seeds "New chat with same cast" and the per-character gallery entries. */
  readonly characters: readonly ChatOptionsCastMember[];
  /** The DRAFT's config key (#40 — the RPG-overlay toggle stages its pre-send intent there). */
  readonly draftKey?: string | undefined;
}

export function ChatOptionsMenu({ chatId, committed = true, title, characters, draftKey }: ChatOptionsMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const deleteChat = useDeleteChat({ trpc, invalidation });
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [galleryFor, setGalleryFor] = useState<ChatOptionsCastMember | null>(null);

  const characterIds = characters.map((c) => c.characterId);
  const soloCharacter = characters.length === 1 ? characters[0] : undefined;

  // Every disabled item names its unlock condition on hover (owner: "when it's disabled on hover tell why").
  // draftReason = the generic "send the first message" unlock (undefined on a committed chat — no tooltip).
  const draftReason = committed ? undefined : DRAFT_UNLOCK_AFTER_SEND;

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
        {/* The #40 RPG-overlay toggle — on/off at ANY time, draft included (where New chat lives). */}
        <GameMenuSection chatId={chatId} committed={committed} draftKey={draftKey} />

        {/* #41 consolidation — Continue/Regenerate/Impersonate moved to the composer WAND (the
            guided-actions home; composer text optional there). The ⋯ menu keeps only actions with no
            wand/panel home. */}
        {/* IA de-dup (owner rule: an option that has a CONTEXT-panel home does NOT belong in the three dots).
            Removed here because each is already a context-panel tab/section: Chat settings (Settings tab),
            Preview request (Preview tab), Injections (Injections tab), and Invite / Hand off host / Leave
            (all in the Members tab's roster admin). Message selection has NO panel home, so it stays. */}
        <MenuItem disabled={!committed} title={draftReason} onClick={enterSelectionMode}>
          Select messages…
        </MenuItem>

        <MenuSeparator />
        <TrailingItems committed={committed} reason={draftReason} onRename={openRename} />
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

interface TrailingItemsProps {
  readonly committed: boolean;
  readonly reason: string | undefined;
  readonly onRename: () => void;
}

/** The trailing group — Rename / Close chat, plus (draft only) a DISABLED "Delete chat" twin. Extracted so
 *  the parent menu stays under the complexity ceiling. Rename disables on a draft (with a reason). Delete is
 *  the confirm-wired `destructive` slot when committed — a draft renders it here, disabled, so the item is
 *  never hidden (owner ruling).
 *
 *  EXPORT IS DELIBERATELY ABSENT: transcript download homes on the chats-LIST row kebab, its ONE home
 *  (the ratified lifecycle placement — the room carries no import/export chrome). */
function TrailingItems({ committed, reason, onRename }: TrailingItemsProps): ReactElement {
  return (
    <>
      <MenuItem disabled={!committed} title={reason} onClick={onRename}>
        <Icon icon={Pencil} size="sm" />
        Rename
      </MenuItem>
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
