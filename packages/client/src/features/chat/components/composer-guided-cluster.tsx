// The composer's GUIDED CLUSTER (W-D — the ST-style control map's right half). FOUR always-visible
// dual-mode icons — Impersonate · Swipe · Response · Continue — plus the ✨ UTILITY menu. Replaces the old
// nested-menu `ComposerWand` (whose submenus ate the first click; whose steer was invisible state).
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
// is aria-disabled (Base UI `focusableWhenDisabled` keeps it hoverable) with its reason on `title`. Response
// is never disabled — Generate opening on a draft, generate reply on any committed tail — which is why it
// hosts empty-send-generate.
//
// THE ONE CONDITIONAL CONTROL (IMP-2): a Stop appears at the cluster's right edge while the impersonate
// STREAM fills the composer, and only then — there is nothing to stop otherwise, and the row-2 turn Stop
// aborts a chat TURN, which an impersonation is not. While it runs, every icon's reason names the stream
// instead of a phantom "wait for the current reply to finish".

import type { GuidedImpersonatePerson } from "@orb/contracts/preset";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Drama, FastForward, Icon, Play, RotateCcw, Square } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useGatedQuery, useTRPC } from "#data";
import {
  CONTINUE_NEEDS_REPLY,
  IMPERSONATE_IN_FLIGHT,
  IMPERSONATE_STOP_LABEL,
  IMPERSONATE_WAIT_FOR_TURN,
  STEER_CUE_CONTINUE,
  STEER_CUE_IMPERSONATE,
  STEER_CUE_RESPONSE,
  STEER_CUE_SWIPE,
  SWIPE_NEEDS_REPLY,
  testId,
} from "#lib";
import type { ChatHandle, DraftSeed } from "#state";
import { isCommitted } from "#state";
import { useComposerUtilities } from "../hooks/use-composer-utilities";
import { useGuidedActions } from "../hooks/use-guided-actions";
import { filterCharacters } from "../lib/roster";
import type { ComposerImageControls } from "./composer-utility-menu";
import { UtilityMenu } from "./composer-utility-menu";
import { RewriteDialog } from "./rewrite-dialog";
import { useRewriteModal } from "./use-rewrite-modal";

export interface ComposerGuidedClusterProps {
  readonly handle: ChatHandle;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed?: DraftSeed | undefined;
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
  /** True while the composer's own Send is in flight — the whole cluster idles (one action at a time). */
  readonly busy?: boolean | undefined;
  /** The tail canon row's role is assistant — gates Swipe/Continue and drives the Response `afterAssistant`
   *  nudge flag. False on a draft / empty chat / a user-tail chat. */
  readonly tailIsAssistant: boolean;
  /** The image controls, re-homed into the ✨ utility menu (owner). */
  readonly imageControls: ComposerImageControls;
  /** The honest-refusal pre-send gate (#54): the chat's resolved connection can't deterministically serve a
   *  turn, so EVERY fire action (impersonate/swipe/response/continue + the ✨-menu turn rows) disables with
   *  `sendUnavailableReason`. Engine-agnostic; the reason wins over a phase reason (both are persistent). */
  readonly sendUnavailable: boolean;
  readonly sendUnavailableReason: string | undefined;
}

/** The four dual-mode guided icons + the ✨ utility menu (grouped Input · Reply · Continuation · Images · Plot —
 *  everything busy is inside the menu; the top row is just the four icons + ✨). */
export function ComposerGuidedCluster(props: ComposerGuidedClusterProps): ReactElement {
  const { handle, value, onChange, draftSeed, onCommitted, busy = false, tailIsAssistant, imageControls, sendUnavailable, sendUnavailableReason } = props;
  const committed = isCommitted(handle);
  const chatId = committed ? handle.id : null;
  const guided = useGuidedActions({ handle, draftSeed, onCommitted, onFireError: (firedText): void => onChange(firedText) });
  const utilities = useComposerUtilities(chatId);
  const trimmed = value.trim();
  const hasText = trimmed.length > 0;

  const rewrite = useRewriteModal(trimmed, guided.fireRewrite, onChange);
  const cast = useCast(chatId);
  const game = useGameSteer(chatId);

  const canTargetTail = committed && guided.tailAssistantMessageId !== null;
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
  const persistentOffReason = streamOffReason ?? (sendUnavailable ? sendUnavailableReason : undefined);
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
  // Response: draft → Generate opening (fireOpening); committed → generate reply (empty=plain, repeatable;
  // text=guided). Passes `afterAssistant` so the server appends the responseNudge on an assistant tail.
  const fireResponse = (speakerCharacterId: CharacterId | null): void => {
    if (committed) {
      guided.fireResponse(trimmed, { speakerCharacterId, afterAssistant: tailIsAssistant });
    } else {
      guided.fireOpening(trimmed);
    }
    onChange("");
  };

  return (
    <Row gap="field" align="center" className="shrink-0" data-slot="composer-guided-cluster">
      <ClusterUtilityMenu
        committed={committed}
        hasText={hasText}
        trimmed={trimmed}
        idle={idle}
        canTargetTail={canTargetTail}
        guided={guided}
        utilities={utilities}
        onChange={onChange}
        onRewrite={rewrite.open}
        game={game}
        image={imageControls}
      />
      <ImpersonateGuidedButton disabled={!idle} hasText={hasText} onPick={fireImpersonate} reason={reasonFor(IMPERSONATE_WAIT_FOR_TURN)} />
      <GuidedIconButton
        icon={RotateCcw}
        label={hasText ? "Swipe with this steering" : "Swipe"}
        steerCue={STEER_CUE_SWIPE}
        hasText={hasText}
        disabled={!(canTargetTail && idle)}
        reason={reasonFor(SWIPE_NEEDS_REPLY)}
        buttonTestId="composerGuidedSwipe"
        // Swipe KEEPS the steer (reroll again with the same guidance) — no onChange clear.
        onFire={(): void => guided.fireSwipe(trimmed)}
      />
      <ResponseGuidedButton hasText={hasText} idle={idle} committed={committed} cast={cast} onFire={fireResponse} disabledReason={persistentOffReason} />
      <GuidedIconButton
        icon={FastForward}
        label={hasText ? "Continue with this steering" : "Continue"}
        steerCue={STEER_CUE_CONTINUE}
        hasText={hasText}
        disabled={!(canTargetTail && idle)}
        reason={reasonFor(CONTINUE_NEEDS_REPLY)}
        buttonTestId="composerGuidedContinue"
        onFire={(): void => fireAndClear(guided.fireContinue)}
      />
      {guided.stopImpersonation === null ? null : <ImpersonateStopButton onStop={guided.stopImpersonation} />}
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
  );
}

/** The ✨ utility-menu wiring for the cluster — keeps the phase-guard conditionals (undo/revert/clear/simple-
 *  send/regenerate/game) out of the parent's cognitive budget. All the "which tail" / "has text" branching
 *  lives here; the parent just hands over the resolved actions bundle. */
function ClusterUtilityMenu({
  committed,
  hasText,
  trimmed,
  idle,
  canTargetTail,
  guided,
  utilities,
  onChange,
  onRewrite,
  game,
  image,
}: {
  readonly committed: boolean;
  readonly hasText: boolean;
  readonly trimmed: string;
  readonly idle: boolean;
  readonly canTargetTail: boolean;
  readonly guided: ReturnType<typeof useGuidedActions>;
  readonly utilities: ReturnType<typeof useComposerUtilities>;
  readonly onChange: (text: string) => void;
  readonly onRewrite: () => void;
  readonly game: { readonly isGame: boolean; readonly plotAvailable: boolean };
  readonly image: ComposerImageControls;
}): ReactElement {
  const tailId = guided.tailAssistantMessageId;
  return (
    <UtilityMenu
      hasText={hasText}
      canTargetTail={canTargetTail}
      canUndoRevert={guided.tailHasContinuation}
      onRewrite={onRewrite}
      onRecall={onChange}
      onUndo={tailId !== null ? (): void => utilities.undoContinue(tailId) : undefined}
      onRevert={tailId !== null ? (): void => utilities.revertContinue(tailId) : undefined}
      onClear={hasText ? (): void => onChange("") : undefined}
      onSimpleSend={hasText && committed ? (): void => utilities.commitMessage(trimmed, () => onChange("")) : undefined}
      // Regenerate (owner: "regenerate goes inside magic wand menu") — a PLAIN reroll of the tail assistant, no
      // steer. The menu row wears a DISTINCT RefreshCw glyph + helper (side-eye P1-A) so it reads apart from the
      // dual-mode steer-aware ⟳ Swipe icon on the top row (§2.3e dual-home). Disabled-with-reason unless a tail
      // assistant reply exists.
      onRegenerate={canTargetTail && idle ? (): void => guided.fireSwipe("") : undefined}
      // The P5 game steers (owner: "game steers go in the magic wand") — game-only, plotProgression-gated.
      game={game.isGame ? { plotAvailable: game.plotAvailable, onSteer: guided.fireGameSteer } : undefined}
      image={image}
    />
  );
}

/** The room cast for the Response speaker submenu (multi-character rooms). Empty on a draft/solo — the
 *  Response icon then fires Auto directly (no submenu). Gated on a committed chatId. */
function useCast(chatId: ChatId | null): ReturnType<typeof filterCharacters> {
  const trpc = useTRPC();
  const rosterQuery = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  return filterCharacters(rosterQuery.data?.participants ?? []);
}

/** The P5 game-steer state (D110-4): is this chat a LIVE game, and is plot-progression on? Reads off the
 *  same warm `getChat`/`getGame` caches the panel + old wand used (lockdown §12 direct cross-feature read). */
function useGameSteer(chatId: ChatId | null): { readonly isGame: boolean; readonly plotAvailable: boolean } {
  const trpc = useTRPC();
  const chatQuery = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const isGame = isRpgEngaged(chatQuery.data?.rpg ?? null);
  const gameQuery = useGatedQuery(isGame ? chatId : null, (id) => trpc.rpg.getGame.queryOptions({ chatId: id }));
  return { isGame, plotAvailable: isGame && gameQuery.data?.publicConfig.plotProgression === true };
}

// ── One dual-mode guided icon ───────────────────────────────────────────────────────────────────────────
interface GuidedIconButtonProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly steerCue: string;
  readonly hasText: boolean;
  readonly disabled: boolean;
  readonly reason: string;
  readonly buttonTestId: "composerGuidedSwipe" | "composerGuidedContinue";
  readonly onFire: () => void;
}

/** A dual-mode guided icon: charges (primary) when the composer has text, teaches the steer contract on
 *  hover, and renders aria-disabled with a legible reason when phase-unavailable (never hidden/swapped). */
function GuidedIconButton(props: GuidedIconButtonProps): ReactElement {
  const { icon, label, steerCue, hasText, disabled, reason, onFire, buttonTestId } = props;
  const title = resolveGuidedTitle({ disabled, hasText, label, steerCue, reason });
  return (
    <Button
      type="button"
      intent={hasText && !disabled ? "primary" : "ghost"}
      size="icon"
      disabled={disabled}
      focusableWhenDisabled={true}
      title={title}
      aria-label={label}
      data-testid={testId(buttonTestId)}
      onClick={disabled ? undefined : onFire}
      className="shrink-0 rounded-full"
    >
      <Icon icon={icon} size="sm" />
    </Button>
  );
}

/** The dual-mode title: the disabled reason, else the label PLUS the steer cue when text is present (the
 *  typed-text-becomes-steer contract taught at the action), else the plain label. */
function resolveGuidedTitle(args: { disabled: boolean; hasText: boolean; label: string; steerCue: string; reason: string }): string {
  if (args.disabled) {
    // Name WHAT the button is AND why it's off (owner): "Swipe — needs an assistant reply first". The label
    // stays legible so a disabled icon isn't a mystery glyph with a bare reason.
    return `${args.label} — ${args.reason}`;
  }
  return args.hasText ? `${args.label} — ${args.steerCue}` : args.label;
}

/** Response's title: a persistent off-cause wins (#54 refusal / the IMP-2 live impersonate stream — Response
 *  has no phase-disabled state of its own), else the steer cue when the composer has text, else the label. */
function responseTitle(label: string, hasText: boolean, disabledReason: string | undefined): string {
  if (disabledReason !== undefined) {
    return `${label} — ${disabledReason}`;
  }
  return hasText ? `${label} — ${STEER_CUE_RESPONSE}` : label;
}

// ── The live impersonate stream's Stop (IMP-2) ───────────────────────────────────────────────────────────
/** Rendered ONLY while an impersonate stream is filling the composer — the same idiom as the turn Stop in
 *  composer row 2 (secondary square icon-button, `rounded-full`), sat at the cluster's right edge directly
 *  above it. Before this, a user watching the composer fill had no way to end the stream: it is a
 *  subscription, so the row-2 turn Stop (which aborts a chat TURN) never applied to it. Stopping KEEPS the
 *  partial fill (a deliberate divergence from ST — see `useGuidedActions.stopImpersonation`). */
function ImpersonateStopButton({ onStop }: { readonly onStop: () => void }): ReactElement {
  return (
    <Button
      type="button"
      intent="secondary"
      size="icon"
      title={IMPERSONATE_STOP_LABEL}
      aria-label={IMPERSONATE_STOP_LABEL}
      data-testid={testId("composerGuidedStopImpersonate")}
      onClick={onStop}
      className="shrink-0 rounded-full"
    >
      <Icon icon={Square} size="sm" />
    </Button>
  );
}

/** The dual-mode ACCESSIBLE NAME (side-eye P3-dualmode): when the composer has text the icon is in its guided
 *  mode, so its announced name says so ("Impersonate" → "Guided impersonate") — the mode-switch a sighted user
 *  reads off the icon's charge state is now spoken too. Empty composer keeps the plain action name. */
function resolveGuidedName(base: string, hasText: boolean): string {
  return hasText ? `Guided ${base.toLowerCase()}` : base;
}

const PERSON_LABEL: Record<GuidedImpersonatePerson, string> = { first: "1st person", second: "2nd person", third: "3rd person" };

// ── Impersonate (hover/click → perspective picker) ──────────────────────────────────────────────────────
function ImpersonateGuidedButton({
  disabled,
  hasText,
  onPick,
  reason,
}: {
  readonly disabled: boolean;
  readonly hasText: boolean;
  readonly onPick: (person: GuidedImpersonatePerson) => void;
  /** The disabled reason (the send cause wins over the phase reason — computed by the parent's `reasonFor`). */
  readonly reason: string;
}): ReactElement {
  const title = resolveGuidedTitle({ disabled, hasText, label: "Impersonate", steerCue: STEER_CUE_IMPERSONATE, reason });
  const name = resolveGuidedName("Impersonate", hasText);
  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        aria-label={name}
        data-testid={testId("composerGuidedImpersonate")}
        render={
          <Button
            type="button"
            intent={hasText && !disabled ? "primary" : "ghost"}
            size="icon"
            focusableWhenDisabled={true}
            title={title}
            className="shrink-0 rounded-full"
          >
            <Icon icon={Drama} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        {(["first", "second", "third"] as const).map((person) => (
          <MenuItem key={person} onClick={(): void => onPick(person)}>
            {PERSON_LABEL[person]}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

// ── Response (never disabled; multi-room speaker submenu) ────────────────────────────────────────────────
function ResponseGuidedButton({
  hasText,
  idle,
  committed,
  cast,
  onFire,
  disabledReason,
}: {
  readonly hasText: boolean;
  readonly idle: boolean;
  readonly committed: boolean;
  readonly cast: ReturnType<typeof filterCharacters>;
  readonly onFire: (speakerCharacterId: CharacterId | null) => void;
  /** The PERSISTENT off-cause when there is one: the honest-refusal reason (#54) or the live impersonate
   *  stream (IMP-2). Response is never phase-disabled, so this is its ONLY disabled reason; it surfaces on
   *  `title` + focusableWhenDisabled. */
  readonly disabledReason: string | undefined;
}): ReactElement {
  const label = committed ? "Generate reply" : "Generate opening";
  const title = responseTitle(label, hasText, disabledReason);
  // The dual-mode accessible name (P3-dualmode): guided when the composer has text, plain when empty.
  const name = resolveGuidedName(label, hasText);
  // Solo/draft: a direct fire (Auto). Multi-room: a submenu picks the speaker (Auto + each member).
  if (cast.length <= 1) {
    return (
      <Button
        type="button"
        intent={hasText ? "primary" : "ghost"}
        size="icon"
        disabled={!idle}
        // An unserveable connection (or a live impersonate stream) disables Response too — keep it hoverable
        // so the reason shows (Response has no OTHER disabled state, so focusableWhenDisabled only matters here).
        focusableWhenDisabled={disabledReason !== undefined}
        title={title}
        aria-label={name}
        data-testid={testId("composerGuidedResponse")}
        onClick={idle ? (): void => onFire(null) : undefined}
        className="shrink-0 rounded-full"
      >
        <Icon icon={Play} size="sm" />
      </Button>
    );
  }
  return (
    <Menu>
      <MenuTrigger
        disabled={!idle}
        aria-label={name}
        data-testid={testId("composerGuidedResponse")}
        render={
          <Button type="button" intent={hasText ? "primary" : "ghost"} size="icon" title={title} className="shrink-0 rounded-full">
            <Icon icon={Play} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        <MenuItem onClick={(): void => onFire(null)}>Auto (arbitrate)</MenuItem>
        {cast.map((member) => (
          <MenuItem key={member.characterId} onClick={(): void => onFire(member.characterId)}>
            <Icon icon={Drama} size="sm" />
            {member.displayName}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
