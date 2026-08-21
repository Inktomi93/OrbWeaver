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

import type { GuidedImpersonatePerson } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Drama, Icon, Play, Square } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { IMPERSONATE_STOP_LABEL, STEER_CUE_IMPERSONATE, STEER_CUE_RESPONSE, testId } from "#lib";
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
  const title = resolveGuidedTitle({ disabled, hasText, label, steerCue, reason });
  return (
    <Tooltip>
      <TooltipTrigger
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
    </Tooltip>
  );
}

function resolveGuidedTitle(args: { disabled: boolean; hasText: boolean; label: string; steerCue: string; reason: string }): string {
  if (args.disabled) {
    return `${args.label} — ${args.reason}`;
  }
  return args.hasText ? `${args.label} — ${args.steerCue}` : args.label;
}

function responseTitle(label: string, hasText: boolean, disabledReason: string | undefined): string {
  if (disabledReason !== undefined) {
    return `${label} — ${disabledReason}`;
  }
  return hasText ? `${label} — ${STEER_CUE_RESPONSE}` : label;
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
  const title = resolveGuidedTitle({ disabled, hasText, label: "Draft your line", steerCue: STEER_CUE_IMPERSONATE, reason });
  const name = resolveGuidedName("Draft your line", hasText);
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
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
  cast,
  onFire,
  disabledReason,
}: {
  readonly hasText: boolean;
  readonly idle: boolean;
  readonly cast: ReturnType<typeof filterCharacters>;
  readonly onFire: (speakerCharacterId: CharacterId | null) => void;
  readonly disabledReason: string | undefined;
}): ReactElement {
  const label = "Generate reply";
  const title = responseTitle(label, hasText, disabledReason);
  const name = resolveGuidedName(label, hasText);
  if (cast.length <= 1) {
    return (
      <Tooltip>
        <TooltipTrigger
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
      </Tooltip>
    );
  }
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              disabled={!idle}
              aria-label={name}
              data-testid={testId("composerGuidedResponse")}
              render={
                <Button
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
      </Tooltip>
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
