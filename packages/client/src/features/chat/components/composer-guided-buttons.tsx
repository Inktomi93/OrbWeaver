// The composer's four guided controls. They are presentation leaves: orchestration, room state, and the
// explicit responsive action-home grid remain in `composer-guided-cluster.tsx`.
//
// NO NATIVE `title` ON A TOOLTIP-WRAPPED TRIGGER (side-eye 2026-08-21). Every control here is a Base UI
// TooltipTrigger, and each ALSO carried the same string as a `title` — so Chrome stacked its own OS tooltip
// on top of the rendered popup after the hover delay, two boxes, one of them unstyled and unpositioned. The
// popup is the surface that explains these controls, and it reaches a DISABLED one on purpose:
// `focusableWhenDisabled` keeps the trigger in the tab order and `data-disabled:pointer-events-auto` keeps
// hover alive, which is precisely what a native title was standing in for. `row-actions-menu.tsx` is the
// house pattern (tooltip, no title); a disabled MENUITEM is the genuine exception (it cannot be wrapped in a
// tooltip, so it keeps `title` — see composer-utility-menu.tsx).
// The reason string is unchanged and still composed "<Label> — <reason>"; only its carrier is now singular.
//
// AND THE TOOLTIP IS NOT THE ONLY CARRIER ANY MORE (#2443, side-eye 2026-09-19). Base UI 1.7.0 builds the
// tooltip's hover with `mouseOnly: true` (`tooltip/trigger/TooltipTrigger.js:147`) and its focus fallback
// returns early unless the trigger matches `:focus-visible` (`floating-ui-react/hooks/useFocus.js:104`), so
// a TAP opens nothing — and the mobile composer is seven icon-only controls with zero visible text, which
// left every disabled reason and every steer/speaker cue unreachable on a phone AND to a virtual
// screen-reader cursor. A PRESS DOOR IS NOT AVAILABLE HERE, and that is a mechanism rather than a
// preference: an aria-disabled Base UI Button swallows its own click (`internals/use-button/useButton.js`
// getButtonProps onClick), so nothing can be opened from the very control that needs explaining. The
// reason/cue therefore also rides an `aria-describedby` -> `sr-only` line (the `chat-controls-band.tsx`
// house pattern), and the SIGHTED touch user gets the cluster-wide refusal as visible copy from
// `composer-guided-cluster.tsx`. It is NOT folded into `aria-label`: the accessible name is what a
// voice-control user SAYS to press the control, and "Generate reply — Local engine is off" is not sayable.

import type { GuidedImpersonatePerson } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Drama, Icon, Play, Square } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useId } from "react";
import { IMPERSONATE_STOP_LABEL, RESPONSE_SPEAKER_CUE, STEER_CUE_IMPERSONATE, STEER_CUE_RESPONSE, testId } from "#lib";
import type { filterCharacters } from "../lib/roster.ts";

const ICON_CONTROL_CLASS = "shrink-0 data-disabled:pointer-events-auto";

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

/** A dual-mode guided icon: charges when the composer has text and keeps disabled reasons discoverable. */
export function GuidedIconButton(props: GuidedIconButtonProps): ReactElement {
  const { icon, label, steerCue, hasText, disabled, reason, onFire, buttonTestId } = props;
  const detail = resolveGuidedDetail({ disabled, hasText, steerCue, reason });
  const title = joinTitle(label, detail);
  const detailId = useId();
  return (
    // `describesTrigger={false}`: this control owns its description below (`ControlDetail`), and the
    // tooltip string DELIBERATELY leads with the label. #2455 made the tooltip seal describe every trigger
    // with its own text at rest; taking that here would announce "<Label> — <detail>" on top of the
    // detail, which is the exact double `resolveGuidedDetail` exists to prevent.
    <Tooltip describesTrigger={false}>
      <TooltipTrigger
        {...(detail === undefined ? {} : { "aria-describedby": detailId })}
        render={
          <Button
            type="button"
            intent={hasText && !disabled ? "primary" : "ghost"}
            size="icon"
            disabled={disabled}
            focusableWhenDisabled={true}
            aria-label={label}
            data-testid={testId(buttonTestId)}
            onClick={disabled ? undefined : onFire}
            shape="pill"
            className={ICON_CONTROL_CLASS}
          >
            <Icon icon={icon} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="top">{title}</TooltipPopup>
      <ControlDetail detail={detail} id={detailId} />
    </Tooltip>
  );
}

/** The half of the tooltip string that is NOT the control's own name — the disabled reason, or the typed
 *  steer's promise. `undefined` when the tooltip would only repeat the accessible name, so nothing is
 *  announced twice. */
function resolveGuidedDetail(args: { disabled: boolean; hasText: boolean; steerCue: string; reason: string }): string | undefined {
  if (args.disabled) {
    return args.reason;
  }
  return args.hasText ? args.steerCue : undefined;
}

/** The tooltip string, unchanged: "<Label> — <detail>", or the bare label when there is no detail. */
function joinTitle(label: string, detail: string | undefined): string {
  return detail === undefined ? label : `${label} — ${detail}`;
}

/** The touch/AT carrier for a composer control's reason or cue (#2443): announced as the control's
 *  DESCRIPTION, so it reaches a pointer that cannot open a tooltip without displacing the name a
 *  voice-control user says. Renders nothing when the tooltip carries only the name. */
function ControlDetail({ detail, id }: { readonly detail: string | undefined; readonly id: string }): ReactElement | null {
  if (detail === undefined) {
    return null;
  }
  return (
    <Text as="span" className="sr-only" id={id}>
      {detail}
    </Text>
  );
}

/** The Response tooltip. `multiCharacter` is the multi-character room, where the trigger opens the SPEAKER
 *  submenu — since #539 retired the standalone speak-as dropdown this control is the one door to "who replies
 *  next", so an idle group-room tooltip says so rather than describing only the plain fire. The disabled reason
 *  and the steer cue keep precedence: an off control explains itself first, and a typed steer is the nearer
 *  promise. */
function responseDetail(hasText: boolean, disabledReason: string | undefined, multiCharacter: boolean): string | undefined {
  if (disabledReason !== undefined) {
    return disabledReason;
  }
  if (hasText) {
    return STEER_CUE_RESPONSE;
  }
  return multiCharacter ? RESPONSE_SPEAKER_CUE : undefined;
}

/** The impersonation Stop remains a leaf of the cluster's `Your message` ARIA home. */
export function ImpersonateStopButton({ onStop }: { readonly onStop: () => void }): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            intent="secondary"
            size="icon"
            aria-label={IMPERSONATE_STOP_LABEL}
            data-testid={testId("composerGuidedStopImpersonate")}
            onClick={onStop}
            shape="pill"
            className="shrink-0"
          >
            <Icon icon={Square} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="top">Stop drafting your line</TooltipPopup>
    </Tooltip>
  );
}

function resolveGuidedName(base: string, hasText: boolean): string {
  return hasText ? `Guided ${base.toLowerCase()}` : base;
}

const PERSON_LABEL: Record<GuidedImpersonatePerson, string> = { first: "1st person", second: "2nd person", third: "3rd person" };

export function ImpersonateGuidedButton({
  disabled,
  hasText,
  onPick,
  reason,
}: {
  readonly disabled: boolean;
  readonly hasText: boolean;
  readonly onPick: (person: GuidedImpersonatePerson) => void;
  readonly reason: string;
}): ReactElement {
  const detail = resolveGuidedDetail({ disabled, hasText, steerCue: STEER_CUE_IMPERSONATE, reason });
  const title = joinTitle("Draft your line", detail);
  const name = resolveGuidedName("Draft your line", hasText);
  const detailId = useId();
  return (
    <Menu>
      {/* `describesTrigger={false}` — see GuidedIconButton above: the tooltip string leads with the
          control's own name, and `ControlDetail` is this control's description. */}
      <Tooltip describesTrigger={false}>
        <TooltipTrigger
          {...(detail === undefined ? {} : { "aria-describedby": detailId })}
          render={
            <MenuTrigger
              disabled={disabled}
              data-testid={testId("composerGuidedImpersonate")}
              render={
                // The name rides the BUTTON, not the trigger (#1021): the trigger renders this element, so it
                // is one DOM node and one string — and an icon-only Button now states its own name.
                <Button
                  aria-label={name}
                  type="button"
                  intent={hasText && !disabled ? "primary" : "ghost"}
                  size="icon"
                  focusableWhenDisabled={true}
                  shape="pill"
                  className={ICON_CONTROL_CLASS}
                >
                  <Icon icon={Drama} size="sm" />
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="top">{title}</TooltipPopup>
        <ControlDetail detail={detail} id={detailId} />
      </Tooltip>
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

export function ResponseGuidedButton({
  hasText,
  idle,
  characters,
  onFire,
  disabledReason,
}: {
  readonly hasText: boolean;
  readonly idle: boolean;
  readonly characters: ReturnType<typeof filterCharacters>;
  readonly onFire: (speakerCharacterId: CharacterId | null) => void;
  readonly disabledReason: string | undefined;
}): ReactElement {
  const label = "Generate reply";
  // The submenu arm is the same size-gate the retired speak-as dropdown carried (D16 roster-of-1): a solo room
  // has no "which character" choice, so the trigger fires Auto directly and its tooltip stays the plain label.
  const multiCharacter = characters.length > 1;
  const detail = responseDetail(hasText, disabledReason, multiCharacter);
  const title = joinTitle(label, detail);
  const name = resolveGuidedName(label, hasText);
  const detailId = useId();
  if (!multiCharacter) {
    // `describesTrigger={false}` — see GuidedIconButton above: the tooltip string leads with the control's
    // own name, and `ControlDetail` is this control's description.
    return (
      <Tooltip describesTrigger={false}>
        <TooltipTrigger
          {...(detail === undefined ? {} : { "aria-describedby": detailId })}
          render={
            <Button
              type="button"
              intent={hasText ? "primary" : "ghost"}
              size="icon"
              disabled={!idle}
              focusableWhenDisabled={disabledReason !== undefined}
              aria-label={name}
              data-testid={testId("composerGuidedResponse")}
              onClick={idle ? (): void => onFire(null) : undefined}
              shape="pill"
              className={ICON_CONTROL_CLASS}
            >
              <Icon icon={Play} size="sm" />
            </Button>
          }
        />
        <TooltipPopup side="top">{title}</TooltipPopup>
        <ControlDetail detail={detail} id={detailId} />
      </Tooltip>
    );
  }
  return (
    <Menu>
      {/* `describesTrigger={false}` — see GuidedIconButton above: the tooltip string leads with the
          control's own name, and `ControlDetail` is this control's description. */}
      <Tooltip describesTrigger={false}>
        <TooltipTrigger
          {...(detail === undefined ? {} : { "aria-describedby": detailId })}
          render={
            <MenuTrigger
              disabled={!idle}
              data-testid={testId("composerGuidedResponse")}
              render={
                // The name rides the BUTTON, not the trigger (#1021) — same node, same string.
                <Button
                  aria-label={name}
                  type="button"
                  intent={hasText ? "primary" : "ghost"}
                  size="icon"
                  focusableWhenDisabled={disabledReason !== undefined}
                  shape="pill"
                  className={ICON_CONTROL_CLASS}
                >
                  <Icon icon={Play} size="sm" />
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="top">{title}</TooltipPopup>
        <ControlDetail detail={detail} id={detailId} />
      </Tooltip>
      <MenuPopup>
        <MenuItem onClick={(): void => onFire(null)}>Auto (arbitrate)</MenuItem>
        {characters.map((member) => (
          <MenuItem key={member.characterId} onClick={(): void => onFire(member.characterId)}>
            <Icon icon={Drama} size="sm" />
            {member.displayName}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
