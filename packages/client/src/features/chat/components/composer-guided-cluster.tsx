// The composer's compact action rail: four always-visible guided actions, room/tools doors, terminal send,
// and the room's one connection-status slot. It wraps only when the controls no longer fit.
//
// DUAL-MODE: empty composer = the plain action; typed text = the guided action (the text IS the steer,
// fired through the existing `steerFor` → `guided` funnel). The typed-text-becomes-steer contract is taught
// by (1) the at-action hover cue and (2) the icons' CHARGE state (primary/ember when the composer has text).
//
// PER-ACTION CLEAR (the reroll ergonomic): Impersonate/Response/Continue CONSUME the steer (clear the
// composer; a failure restores it via the D57 onFireError path); Swipe KEEPS it (reroll again and again
// with the same guidance, never re-typed).
//
// SHOW-EVERYTHING ([[no-separate-reduced-modes]]): all four icons ALWAYS render — a phase-unavailable icon
// is aria-disabled (Base UI `focusableWhenDisabled` keeps it hoverable) with its reason in the tooltip and
// the control's `aria-describedby` description. A no-connection refusal also carries a persistent direct
// recovery action; other band-wide refusals render visible copy at a coarse pointer.
// Response is never disabled (it generates a reply against any tail), which is why it hosts
// empty-send-generate.
//
// EVERY ICON FIRES AGAINST A REAL ROOM (D166). Response used to
// carry a second label ("Generate opening") and a second fire path that CREATED the chat with
// `opening:"generate"`; impersonate carried a force-commit. The room exists from the creation click, so both
// are ordinary turns and the cluster takes a `chatId`, not a phase.
//
// ONE SPEAK-AS DOOR (#539, the #520/#532 duplicate-action-door class). `Their reply` used to host a FIFTH
// control — the standalone `SpeakAsSelect` dropdown — beside Response, ~150px apart, both offering
// "Auto + one item per character" and both firing `chat.generate` with a `speakerCharacterId`. They were not
// two features: the Response submenu is a strict SUPERSET (it carries the composer's typed steer as `guided`
// and the `afterAssistant` responseNudge), and the standalone one silently DISCARDED both — it was the
// LOSING arm of the 2026-07-25 parity audit's F5 fork ("speak-as consumes the draft as steer, OR the wand's
// Response grows a speaker submenu"), left standing after the submenu arm shipped. Retired here; the
// Response tooltip names the speaker choice in a multi-character room so the affordance stays legible.
//
// THE ONE CONDITIONAL CONTROL (IMP-2): while the impersonate STREAM fills the composer, its Stop belongs
// beside Draft your line inside `Your message` because both govern the same user-draft operation. The
// terminal turn Stop remains in `Attach and send`: it aborts a chat TURN, which an impersonation is not.
// While drafting runs, every icon's reason names the stream instead of a phantom current reply.

import type { GuidedImpersonatePerson } from "@orb/contracts/preset";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { FastForward, RotateCcw } from "@orb/ui/icons";
import { Container, Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useGatedQuery, useTRPC } from "#data";
import { IMPERSONATE_IN_FLIGHT, IMPERSONATE_WAIT_FOR_TURN, STEER_CUE_CONTINUE, STEER_CUE_SWIPE, SWIPE_NEEDS_REPLY } from "#lib";
import { useComposerUtilities } from "../hooks/use-composer-utilities.ts";
import { useGuidedActions } from "../hooks/use-guided-actions.ts";
import { filterCharacters } from "../lib/roster.ts";
import { GuidedIconButton, ImpersonateGuidedButton, ImpersonateStopButton, ResponseGuidedButton } from "./composer-guided-buttons.tsx";
import type { ComposerImageControls } from "./composer-utility-menu.tsx";
import { ComposerGuidedUtilityMenu } from "./composer-utility-menu.tsx";
import { RewriteDialog } from "./rewrite-dialog.tsx";
import { useRewriteModal } from "./use-rewrite-modal.ts";

export interface ComposerGuidedClusterProps {
  readonly chatId: ChatId;
  readonly value: string;
  readonly onChange: (text: string) => void;
  /** True while the composer's own Send is in flight — the whole cluster idles (one action at a time). */
  readonly busy?: boolean | undefined;
  /** The tail canon row's role is assistant — gates Swipe/Continue and drives the Response `afterAssistant`
   *  nudge flag. False on an empty chat / a user-tail chat. */
  readonly tailIsAssistant: boolean;
  /** The image controls, re-homed into the ✨ utility menu (owner). */
  readonly imageControls: ComposerImageControls;
  /** The honest-refusal pre-send gate (#54): the chat's resolved connection can't deterministically serve a
   *  turn, so EVERY fire action (impersonate/swipe/response/continue + the ✨-menu turn rows) disables with
   *  `sendUnavailableReason`. Engine-agnostic; the reason wins over a phase reason (both are persistent). */
  readonly sendUnavailable: boolean;
  readonly sendUnavailableReason: string | undefined;
  /** The room-level action that leads the action rail. */
  readonly chatControl: ReactNode;
  /** The one visible home for next-turn connection identity, warnings, and recovery. */
  readonly connectionStatus: ReactNode;
  readonly actionContributions: readonly ReactNode[];
  readonly mediaContributions: readonly ReactNode[];
  /** The composer-owned terminal send/stop control; kept beside attachment tools as one physical cluster. */
  readonly sendControl: ReactNode;
}

/** The composer's compact action rail: room actions, guided message/reply actions, one connection-status
 *  slot, then attachment utilities and the terminal send control. */
export function ComposerGuidedCluster(props: ComposerGuidedClusterProps): ReactElement {
  const {
    chatId,
    value,
    onChange,
    busy = false,
    tailIsAssistant,
    imageControls,
    sendUnavailable,
    sendUnavailableReason,
    chatControl,
    connectionStatus,
    actionContributions,
    mediaContributions,
    sendControl,
  } = props;
  const guided = useGuidedActions({ chatId, onFireError: (firedText): void => onChange(firedText) });
  const utilities = useComposerUtilities(chatId);
  const trimmed = value.trim();
  const hasText = trimmed.length > 0;

  const rewrite = useRewriteModal(trimmed, guided.fireRewrite, onChange);
  const characters = useRoomCharacters(chatId);
  const game = useGameSteer(chatId);

  const canTargetTail = guided.tailAssistantMessageId !== null;
  // The honest-refusal gate (#54) folds into `idle`: an unserveable connection idles EVERY fire action (they
  // all fire a doomed turn). `reasonFor` then lets the send cause WIN over the phase reason (both persistent):
  // a disabled icon on an off engine reads "Local engine is off…", not "needs a reply first".
  const anyBusy = guided.isPending || busy === true;
  const idle = !(anyBusy || sendUnavailable);
  // IMP-2 — a LIVE impersonate stream is the honest off-cause while it runs: it idles every icon, but nothing
  // is being generated into the transcript, so the generic "wait for the current reply to finish" pointed at a
  // turn the user could neither see nor stop. It wins over the send cause (it is the immediate one, and it
  // ends on its own or on the Stop rendered beside the icons); a phase reason loses to both.
  const impersonating = guided.stopImpersonation !== null;
  const streamOffReason = impersonating ? IMPERSONATE_IN_FLIGHT : undefined;
  const sendRefusal = sendUnavailable ? sendUnavailableReason : undefined;
  const persistentOffReason = streamOffReason ?? sendRefusal;
  const reasonFor = (phaseReason: string): string => persistentOffReason ?? phaseReason;

  // CONSUME actions clear the composer on fire; onFireError restores it on failure (D57).
  const fireAndClear = (run: (input: string) => void): void => {
    run(trimmed);
    onChange("");
  };
  // Impersonate is NON-PERSISTING (owner ruling): it DRAFTS the user's next line and FILLS the composer with
  // it for review (the ST flow) — the typed steer is consumed and REPLACED by the drafted line. Nothing is
  // committed; the user edits then sends normally. A failed draft restores the steer via onFireError (D57).
  const fireImpersonate = (person: GuidedImpersonatePerson): void => {
    guided.fireImpersonate(trimmed, person, (text) => onChange(text));
  };
  // Response: generate a reply (empty = plain and repeatable; text = guided). Passes `afterAssistant` so
  // the server appends the responseNudge on an assistant tail.
  const fireResponse = (speakerCharacterId: CharacterId | null): void => {
    guided.fireResponse(trimmed, { speakerCharacterId, afterAssistant: tailIsAssistant });
    onChange("");
  };

  return (
    <Container className="w-full min-w-0">
      <Row align="center" className="min-w-0 flex-wrap" data-slot="composer-guided-cluster" gap="field">
        <Row aria-label="Chat actions" className="shrink-0" data-slot="composer-chat-actions" gap="field" role="group">
          {chatControl}
        </Row>
        <Row aria-label="Your message" className="shrink-0" data-slot="composer-you-actions" gap="field" role="group">
          <ImpersonateGuidedButton disabled={!idle} hasText={hasText} onPick={fireImpersonate} reason={reasonFor(IMPERSONATE_WAIT_FOR_TURN)} />
          {guided.stopImpersonation === null ? null : <ImpersonateStopButton onStop={guided.stopImpersonation} />}
        </Row>
        <Row aria-label="Their reply" className="min-w-0 shrink-0" data-slot="composer-them-actions" gap="field" role="group">
          <GuidedIconButton
            icon={RotateCcw}
            label={hasText ? "Try another reply with this direction" : "Try another reply"}
            steerCue={STEER_CUE_SWIPE}
            hasText={hasText}
            disabled={!(canTargetTail && idle)}
            reason={reasonFor(SWIPE_NEEDS_REPLY)}
            buttonTestId="composerGuidedSwipe"
            onFire={(): void => guided.fireSwipe(trimmed)}
          />
          <ResponseGuidedButton hasText={hasText} idle={idle} characters={characters} onFire={fireResponse} disabledReason={persistentOffReason} />
          <GuidedIconButton
            icon={FastForward}
            label={hasText ? "Continue the reply with this direction" : "Continue the reply"}
            steerCue={STEER_CUE_CONTINUE}
            hasText={hasText}
            disabled={!(canTargetTail && idle)}
            reason={reasonFor(SWIPE_NEEDS_REPLY)}
            buttonTestId="composerGuidedContinue"
            onFire={(): void => fireAndClear(guided.fireContinue)}
          />
        </Row>
        {actionContributions}
        {connectionStatus}
        <Row aria-label="Attach and send" className="ms-auto shrink-0" data-slot="composer-attach-actions" gap="field" role="group">
          <ComposerGuidedUtilityMenu
            hasText={hasText}
            trimmed={trimmed}
            idle={idle}
            generationUnavailableReason={reasonFor("Wait for the current reply to finish")}
            canTargetTail={canTargetTail}
            guided={guided}
            utilities={utilities}
            onChange={onChange}
            onRewrite={rewrite.open}
            game={game}
            image={imageControls}
            mediaContributions={mediaContributions}
          />
          {sendControl}
        </Row>
        <RewriteDialog
          open={rewrite.isOpen}
          onOpenChange={rewrite.setOpen}
          instruction={rewrite.instruction}
          onInstructionChange={rewrite.setInstruction}
          selected={rewrite.toggles}
          onToggle={rewrite.toggle}
          onApply={rewrite.apply}
        />
      </Row>
    </Container>
  );
}

/** The room's seated CHARACTERS for the Response speaker submenu (multi-character rooms). Empty/solo — the
 *  Response icon then fires Auto directly (no submenu). */
function useRoomCharacters(chatId: ChatId): ReturnType<typeof filterCharacters> {
  const trpc = useTRPC();
  const rosterQuery = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return filterCharacters(rosterQuery.data?.participants ?? []);
}

/** The P5 game-steer state (D110-4): is this chat a LIVE game, and is plot-progression on? Reads off the
 *  same warm `getChat`/`getGame` caches the panel + old wand used (lockdown §12 direct cross-feature read). */
function useGameSteer(chatId: ChatId): { readonly isGame: boolean; readonly plotAvailable: boolean } {
  const trpc = useTRPC();
  const chatQuery = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const isGame = isRpgEngaged(chatQuery.data?.rpg ?? null);
  const gameQuery = useGatedQuery(isGame ? chatId : null, (id) => trpc.rpg.getGame.queryOptions({ chatId: id }));
  return { isGame, plotAvailable: isGame && gameQuery.data?.publicConfig.plotProgression === true };
}
