// The guided-generations wand: the composer's current draft text becomes the guidance param, the item
// fires, the composer clears. ONE menu across draft + committed (no separate reduced-mode surface — the
// draft renders the SAME items with the not-yet-applicable ones DISABLED, never a swapped sibling menu):
// Guided response / swipe / continue / Rewrite / Impersonate, plus a Recent-steers recall. "Guided
// response" is the one action a draft CAN take — it routes to `fireOpening` (chat.startChat,
// opening:"generate") pre-commit and to `fireResponse` (chat.generate) once committed, same user intent
// (steer the next AI turn) either side of the promotion. swipe/continue/rewrite need a tail assistant turn
// to target; impersonate needs a committed chat — all disable on a draft (swipe/continue/rewrite also
// disable on a committed chat with no assistant tail).
//
// F5 — in a MULTI-CHARACTER room "Guided response" becomes a speaker submenu (Auto + one member each) so a
// steer + a chosen speaker ride ONE `chat.generate`; a solo/1:1 chat keeps the plain item (no "which
// character" choice). F3 — the just-fired steer is restored to the composer on a mutation FAILURE (the
// source's sacred input-restore, client-only per D57), and a Recent-steers submenu recalls this session's
// last fired steers back into the composer.
// F1 — Rewrite OPENS a modal (owner ruling 2026-07-25): a correction-instruction box + the REWRITE_TOGGLES
// catalog. Apply composes the selected toggle fragments + the free text into ONE steer (composeRewriteSteer)
// and fires the SAME chat.swipe + guided{action:"rewrite"} on the tail assistant message, landing the
// out-of-character correction as a new VARIANT (the delivery seam existed; the modal is the guided front end).

import type { RewriteToggleId } from "@orb/contracts/preset";
import { REWRITE_TOGGLES } from "@orb/contracts/preset";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { GuidedGameSteerKind } from "@orb/kit/guided";
import { composeRewriteSteer, RPG_PLOT_STEER_KINDS, RPG_PLOT_STEERS } from "@orb/kit/guided";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Compass, Drama, History, Icon, ListOrdered, Pencil, WandSparkles } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { useGatedQuery, useTRPC } from "#data";
import { DRAFT_UNLOCK_AFTER_SEND, NEEDS_ASSISTANT_REPLY, testId, WAND_NEEDS_TEXT } from "#lib";
import type { ChatHandle, DraftSeed } from "#state";
import { isCommitted, useRecentSteers, useTurnPhase } from "#state";
import type { UseGuidedActionsResult } from "../hooks/use-guided-actions";
import { useGuidedActions } from "../hooks/use-guided-actions";
import { filterCharacters } from "../lib/roster";
import { ImpersonateSubmenu } from "./impersonate-submenu";
import { RewriteDialog } from "./rewrite-dialog";

export interface ComposerWandProps {
  readonly handle: ChatHandle;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed?: DraftSeed | undefined;
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
  /** True while the composer's own Send is in flight, so the wand can't fire a guided action against a
   *  still-populated draft during the send's pre-commit window. */
  readonly busy?: boolean | undefined;
}

export function ComposerWand({ handle, value, onChange, draftSeed, onCommitted, busy = false }: ComposerWandProps): ReactElement {
  const committed = isCommitted(handle);
  // F3 — restore the just-fired steer to the composer when a guided mutation fails (the input isn't lost).
  const guided = useGuidedActions({ handle, draftSeed, onCommitted, onFireError: (firedText): void => onChange(firedText) });
  const recentSteers = useRecentSteers();

  const trimmed = value.trim();

  // Rewrite modal state — extracted to the local hook (state ownership + D57 input-recovery semantics
  // unchanged; see useRewriteModal below). Extraction keeps this component under the complexity ceiling.
  const rewrite = useRewriteModal(trimmed, guided.fireRewrite, onChange);
  // All the derived enable/disable flags + hover reasons + the roster/game reads (see useWandFlags below).
  const flags = useWandFlags(handle, trimmed, guided, busy);
  const { hasText, canOpen, triggerReason, textReason, canTargetTail, canSteerTail, tailReason, draftReason, cast, isMultiRoom, isGame, plotAvailable } = flags;

  // The primary steer: a draft opens the chat (chat.startChat) with the steer; a committed chat generates
  // the next turn (chat.generate). Same item, same intent, phase picks the verb — no swapped sibling item.
  const firePrimarySteer = committed ? guided.fireResponse : guided.fireOpening;

  const fireAndClear = (run: (input: string) => void): void => {
    run(trimmed);
    onChange("");
  };
  // F5 — fire "Guided response" at a chosen speaker (or Auto) in a multi-room, clearing the draft.
  const fireResponseAs = (speakerCharacterId: CharacterId | null): void => {
    guided.fireResponse(trimmed, speakerCharacterId);
    onChange("");
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          disabled={!canOpen}
          aria-label="Guided generations"
          data-testid={testId("composerWand")}
          render={
            // focusableWhenDisabled ⇒ Base UI renders aria-disabled (not native `disabled`), so the button
            // stays hoverable and the `title` reason surfaces on hover; the click stays a guarded no-op.
            <Button type="button" intent="ghost" size="icon" focusableWhenDisabled={true} title={triggerReason}>
              <Icon icon={WandSparkles} size="sm" />
            </Button>
          }
        />
        <MenuPopup>
          {isMultiRoom ? (
            // A targeted nudge: the steer + a chosen speaker (or Auto) on one turn (F5). Text-gated:
            // the typed draft IS the steer (a game chat opens the menu text-lessly, so gate per item).
            <MenuSubmenuRoot>
              <MenuSubmenuTrigger disabled={!hasText} title={textReason}>
                Guided response
              </MenuSubmenuTrigger>
              <MenuPopup>
                <MenuItem onClick={(): void => fireResponseAs(null)}>Auto (arbitrate)</MenuItem>
                {cast.map((member) => (
                  <MenuItem key={member.id} onClick={(): void => fireResponseAs(member.characterId)}>
                    <Icon icon={Drama} size="sm" />
                    {member.displayName}
                  </MenuItem>
                ))}
              </MenuPopup>
            </MenuSubmenuRoot>
          ) : (
            <MenuItem disabled={!hasText} title={textReason} onClick={(): void => fireAndClear(firePrimarySteer)}>
              Guided response
            </MenuItem>
          )}
          <MenuItem disabled={!canSteerTail} title={textReason ?? tailReason} onClick={(): void => fireAndClear(guided.fireSwipe)}>
            Guided swipe
          </MenuItem>
          <MenuItem disabled={!canSteerTail} title={textReason ?? tailReason} onClick={(): void => fireAndClear(guided.fireContinue)}>
            Guided continue
          </MenuItem>
          {/* F1 — rewrite the last reply out of character; OPENS the modal (instruction + toggle catalog),
              which fires guided.fireRewrite on Apply. Needs a tail assistant reply to correct. */}
          <MenuItem disabled={!canTargetTail} title={tailReason} onClick={rewrite.open}>
            <Icon icon={Pencil} size="sm" />
            Rewrite…
          </MenuItem>
          {/* Impersonate needs a committed chat's turn machinery — disabled (never swapped away) on a draft. */}
          <ImpersonateSubmenu
            disabled={!committed}
            reason={draftReason}
            onPick={(person): void => fireAndClear((input) => guided.fireImpersonate(input, person))}
          />
          {isGame ? <WandGameSection plotAvailable={plotAvailable} onSteer={guided.fireGameSteer} /> : null}
          {recentSteers.length > 0 ? <WandRecentSteers steers={recentSteers} onRecall={onChange} /> : null}
        </MenuPopup>
      </Menu>
      <RewriteDialog
        open={rewrite.isOpen}
        onOpenChange={rewrite.setOpen}
        instruction={rewrite.instruction}
        onInstructionChange={rewrite.setInstruction}
        selected={rewrite.toggles}
        onToggle={rewrite.toggle}
        onApply={rewrite.apply}
      />
    </>
  );
}

// ── The Rewrite modal state hook (F1 — extracted verbatim from the component body) ──────────────────────
// State OWNED at the wand (not the dialog) so an Esc/Cancel preserves the typed instruction and the toggle
// selection (the source's sacred input-recovery posture, D57): closing the modal never destroys the state;
// only an explicit Apply (fire + reset) or a fresh seed clears it.

interface RewriteModal {
  readonly isOpen: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly instruction: string;
  readonly setInstruction: (text: string) => void;
  readonly toggles: ReadonlySet<RewriteToggleId>;
  readonly toggle: (id: RewriteToggleId, on: boolean) => void;
  readonly open: () => void;
  readonly apply: () => void;
}

function useRewriteModal(trimmed: string, fireRewrite: (steer: string) => void, onChange: (text: string) => void): RewriteModal {
  const [isOpen, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [toggles, setToggles] = useState<ReadonlySet<RewriteToggleId>>(new Set<RewriteToggleId>());

  const open = (): void => {
    // Pre-seed the instruction from the current composer draft when one exists — the existing wand gesture
    // (type a steer, fire Rewrite) is not orphaned; an empty composer opens with whatever the last modal
    // session preserved (a cancelled draft the user is returning to).
    if (trimmed.length > 0) {
      setInstruction(trimmed);
    }
    setOpen(true);
  };
  const toggle = (id: RewriteToggleId, on: boolean): void => {
    setToggles((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };
  const apply = (): void => {
    // Compose in CATALOG ORDER (map REWRITE_TOGGLES, keep only selected) so the fired steer is deterministic
    // regardless of click order — the composed string becomes {{input}} inside the preset's rewrite template.
    const fragments = REWRITE_TOGGLES.filter((t) => toggles.has(t.id)).map((t) => t.fragment);
    const steer = composeRewriteSteer(fragments, instruction);
    if (steer.length === 0) {
      return;
    }
    fireRewrite(steer);
    // Reset the modal + clear the composer draft (the steer was consumed) — mirrors fireAndClear.
    setOpen(false);
    setInstruction("");
    setToggles(new Set<RewriteToggleId>());
    onChange("");
  };

  return { isOpen, setOpen, instruction, setInstruction, toggles, toggle, open, apply };
}

// ── The derived wand flags (extracted so the component stays under the complexity ceiling) ──────────────
// Every enable/disable verdict + its named hover reason (owner: "when it's disabled on hover tell why"),
// plus the roster + game reads. P5: a committed GAME chat opens the wand text-lessly (the game items fire
// a picked KIND, not the draft); the text-consuming items then disable individually with WAND_NEEDS_TEXT.
// Game-ness rides the same getChat cache key (`chatDetail.rpg`, the message-list-surface precedent); the
// knobs ride `rpg.getGame.publicConfig` (cache-first — the rpg panel shares this exact key; lockdown §12
// direct cross-feature tRPC read). Until the knob query settles the Plot submenu stays absent (no flash).

interface WandFlags {
  readonly hasText: boolean;
  readonly canOpen: boolean;
  readonly triggerReason: string | undefined;
  readonly textReason: string | undefined;
  readonly canTargetTail: boolean;
  readonly canSteerTail: boolean;
  readonly tailReason: string | undefined;
  readonly draftReason: string | undefined;
  readonly cast: ReturnType<typeof filterCharacters>;
  readonly isMultiRoom: boolean;
  readonly isGame: boolean;
  readonly plotAvailable: boolean;
}

/** The roster + game half of the flags (its own hook so each half stays under the complexity ceiling). */
function useWandRoomFlags(handle: ChatHandle): Pick<WandFlags, "cast" | "isMultiRoom" | "isGame" | "plotAvailable"> {
  const trpc = useTRPC();
  const committed = isCommitted(handle);
  const chatId = committed ? handle.id : null;

  // F5 — the room roster (same warm cache speak-as reads); a >1-character room makes "Guided response" a
  // speaker submenu. Gated on a committed chatId (a draft has no roster yet), degrades to [] until populated.
  const rosterQuery = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const cast = filterCharacters(rosterQuery.data?.participants ?? []);
  const isMultiRoom = committed && cast.length > 1;

  // #40 — a DISENGAGED game (pointer engaged:false) gates OFF like a non-game chat (one predicate home).
  const isGame = committed && isRpgEngaged(rosterQuery.data?.rpg ?? null);
  const gameQuery = useGatedQuery(isGame ? chatId : null, (id) => trpc.rpg.getGame.queryOptions({ chatId: id }));
  const plotAvailable = isGame && gameQuery.data?.publicConfig.plotProgression === true;

  return { cast, isMultiRoom, isGame, plotAvailable };
}

function useWandFlags(handle: ChatHandle, trimmed: string, guided: UseGuidedActionsResult, busy: boolean): WandFlags {
  const committed = isCommitted(handle);
  const chatId = committed ? handle.id : null;
  const phase = useTurnPhase(chatId);
  const turnBusy = phase === "pending" || phase === "streaming" || phase === "stopping";
  const room = useWandRoomFlags(handle);
  const { isGame } = room;

  const hasText = trimmed.length > 0;
  const idle = !(turnBusy || guided.isPending || busy);
  const canOpen = (hasText || isGame) && idle;
  // The disabled trigger explains itself on hover — the empty-composer case is the FIRST thing a user sees
  // on a fresh draft, so name the unlock (type a message). A busy/pending disablement is transient.
  const triggerReason = hasText || isGame ? undefined : WAND_NEEDS_TEXT;
  const textReason = hasText ? undefined : WAND_NEEDS_TEXT;
  // A tail assistant slot to target — never present on a draft (no canon), so swipe/continue/rewrite disable.
  const canTargetTail = committed && guided.tailAssistantMessageId !== null;
  // Swipe/continue consume the typed steer AND target the tail — both unlocks named on hover.
  const canSteerTail = canTargetTail && hasText;
  // A draft unlocks on the first send; a committed chat with no assistant tail needs an assistant reply.
  const draftReason = committed ? undefined : DRAFT_UNLOCK_AFTER_SEND;
  const tailReason = canTargetTail ? undefined : (draftReason ?? NEEDS_ASSISTANT_REPLY);

  return { hasText, canOpen, triggerReason, textReason, canTargetTail, canSteerTail, tailReason, draftReason, ...room };
}

// ── The P5 GAME section (the Plot submenu + the one-shot "Offer choices") ───────────────────────────────
// Rendered only in a committed GAME chat. The Plot submenu is APPLICABILITY-gated on the game's
// `plotProgression` knob (absent when off — never a disabled twin, [no-separate-reduced-modes]); the
// "Offer choices" one-shot shows for every game chat (M5 — the this-turn-only ask, independent of the
// standing `cyoa` mode). Both fire a KIND through the same guided path (`fireGameSteer`).

interface WandGameSectionProps {
  readonly plotAvailable: boolean;
  readonly onSteer: (kind: GuidedGameSteerKind) => void;
}

function WandGameSection({ plotAvailable, onSteer }: WandGameSectionProps): ReactElement {
  return (
    <>
      <MenuSeparator />
      {plotAvailable ? (
        <MenuSubmenuRoot>
          <MenuSubmenuTrigger>
            <Icon icon={Compass} size="sm" />
            Plot
          </MenuSubmenuTrigger>
          <MenuPopup>
            {RPG_PLOT_STEER_KINDS.map((kind) => (
              <MenuItem key={kind} onClick={(): void => onSteer(kind)}>
                {RPG_PLOT_STEERS[kind].label}
              </MenuItem>
            ))}
          </MenuPopup>
        </MenuSubmenuRoot>
      ) : null}
      <MenuItem onClick={(): void => onSteer("choices")}>
        <Icon icon={ListOrdered} size="sm" />
        Offer choices
      </MenuItem>
    </>
  );
}

// ── The F3 Recent-steers recall submenu (extracted verbatim) ────────────────────────────────────────────
// Recall a steer fired earlier this session back into the composer (the source's input recovery).
// Rendered only when the ring has entries; picking one refills the draft, it does not re-fire.

function WandRecentSteers({ steers, onRecall }: { readonly steers: readonly string[]; readonly onRecall: (steer: string) => void }): ReactElement {
  return (
    <>
      <MenuSeparator />
      <MenuSubmenuRoot>
        <MenuSubmenuTrigger>
          <Icon icon={History} size="sm" />
          Recent steers
        </MenuSubmenuTrigger>
        <MenuPopup>
          {steers.map((steer) => (
            <MenuItem key={steer} onClick={(): void => onRecall(steer)}>
              {steer}
            </MenuItem>
          ))}
        </MenuPopup>
      </MenuSubmenuRoot>
    </>
  );
}
