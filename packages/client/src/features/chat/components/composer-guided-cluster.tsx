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

import type { GuidedImpersonatePerson } from "@orb/contracts/preset";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { GuidedGameSteerKind } from "@orb/kit/guided";
import { RPG_PLOT_STEER_KINDS, RPG_PLOT_STEERS } from "@orb/kit/guided";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Compass, Drama, FastForward, Icon, ListOrdered, Play, RotateCcw } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useGatedQuery, useTRPC } from "#data";
import {
  CONTINUE_NEEDS_REPLY,
  IMPERSONATE_NEEDS_CHAT,
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
}

/** The four dual-mode guided icons + the ✨ utility menu. */
export function ComposerGuidedCluster(props: ComposerGuidedClusterProps): ReactElement {
  const { handle, value, onChange, draftSeed, onCommitted, busy = false, tailIsAssistant } = props;
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
  const idle = !(guided.isPending || busy);

  // CONSUME actions clear the composer on fire; onFireError restores it on failure (D57).
  const fireAndClear = (run: (input: string) => void): void => {
    run(trimmed);
    onChange("");
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

  const tailId = guided.tailAssistantMessageId;
  return (
    <Row gap="field" align="center" className="shrink-0" data-slot="composer-guided-cluster">
      <UtilityMenu
        hasText={hasText}
        canTargetTail={canTargetTail}
        canUndoRevert={guided.tailHasContinuation}
        onRewrite={rewrite.open}
        onRecall={onChange}
        onUndo={tailId !== null ? (): void => utilities.undoContinue(tailId) : undefined}
        onRevert={tailId !== null ? (): void => utilities.revertContinue(tailId) : undefined}
        onClear={hasText ? (): void => onChange("") : undefined}
        onSimpleSend={hasText && committed ? (): void => utilities.commitMessage(trimmed, () => onChange("")) : undefined}
      />
      <ImpersonateGuidedButton
        disabled={!(committed && idle)}
        hasText={hasText}
        onPick={(person): void => fireAndClear((input) => guided.fireImpersonate(input, person))}
      />
      <GuidedIconButton
        icon={RotateCcw}
        label={hasText ? "Regenerate with this steering" : "Regenerate"}
        steerCue={STEER_CUE_SWIPE}
        hasText={hasText}
        disabled={!(canTargetTail && idle)}
        reason={SWIPE_NEEDS_REPLY}
        buttonTestId="composerGuidedSwipe"
        // Swipe KEEPS the steer (reroll again with the same guidance) — no onChange clear.
        onFire={(): void => guided.fireSwipe(trimmed)}
      />
      <ResponseGuidedButton hasText={hasText} idle={idle} committed={committed} cast={cast} onFire={fireResponse} />
      <GuidedIconButton
        icon={FastForward}
        label={hasText ? "Continue with this steering" : "Continue"}
        steerCue={STEER_CUE_CONTINUE}
        hasText={hasText}
        disabled={!(canTargetTail && idle)}
        reason={CONTINUE_NEEDS_REPLY}
        buttonTestId="composerGuidedContinue"
        onFire={(): void => fireAndClear(guided.fireContinue)}
      />
      {game.isGame ? <GameSteerMenu plotAvailable={game.plotAvailable} onSteer={guided.fireGameSteer} /> : null}
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

// ── The P5 game-steer menu (Plot submenu + "Offer choices") — game chats only (D110-4, re-homed from the
// old wand). The Plot submenu is APPLICABILITY-gated on `plotProgression` (absent when off, never a disabled
// twin, [[no-separate-reduced-modes]]); "Offer choices" is the one-shot ask independent of the standing cyoa
// mode. Both fire a KIND through the trusted-template guided path (`fireGameSteer`, ruling-#9).
function GameSteerMenu({ plotAvailable, onSteer }: { readonly plotAvailable: boolean; readonly onSteer: (kind: GuidedGameSteerKind) => void }): ReactElement {
  return (
    <Menu>
      <MenuTrigger
        aria-label="Game steers"
        data-testid={testId("composerGuidedGameSteer")}
        render={
          <Button type="button" intent="ghost" size="icon" title="Game steers" className="shrink-0 rounded-full">
            <Icon icon={Compass} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        {plotAvailable
          ? RPG_PLOT_STEER_KINDS.map((kind) => (
              <MenuItem key={kind} onClick={(): void => onSteer(kind)}>
                <Icon icon={Compass} size="sm" />
                {RPG_PLOT_STEERS[kind].label}
              </MenuItem>
            ))
          : null}
        {plotAvailable ? <MenuSeparator /> : null}
        <MenuItem onClick={(): void => onSteer("choices")}>
          <Icon icon={ListOrdered} size="sm" />
          Offer choices
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
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
    return args.reason;
  }
  return args.hasText ? `${args.label} — ${args.steerCue}` : args.label;
}

const PERSON_LABEL: Record<GuidedImpersonatePerson, string> = { first: "1st person", second: "2nd person", third: "3rd person" };

// ── Impersonate (hover/click → perspective picker) ──────────────────────────────────────────────────────
function ImpersonateGuidedButton({
  disabled,
  hasText,
  onPick,
}: {
  readonly disabled: boolean;
  readonly hasText: boolean;
  readonly onPick: (person: GuidedImpersonatePerson) => void;
}): ReactElement {
  const title = resolveGuidedTitle({ disabled, hasText, label: "Impersonate", steerCue: STEER_CUE_IMPERSONATE, reason: IMPERSONATE_NEEDS_CHAT });
  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        aria-label="Impersonate"
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
}: {
  readonly hasText: boolean;
  readonly idle: boolean;
  readonly committed: boolean;
  readonly cast: ReturnType<typeof filterCharacters>;
  readonly onFire: (speakerCharacterId: CharacterId | null) => void;
}): ReactElement {
  const label = committed ? "Generate reply" : "Generate opening";
  const title = hasText ? `${label} — ${STEER_CUE_RESPONSE}` : label;
  // Solo/draft: a direct fire (Auto). Multi-room: a submenu picks the speaker (Auto + each member).
  if (cast.length <= 1) {
    return (
      <Button
        type="button"
        intent={hasText ? "primary" : "ghost"}
        size="icon"
        disabled={!idle}
        title={title}
        aria-label={label}
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
        aria-label={label}
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
