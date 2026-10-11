// The PIN — the default-persona affordance, ONE glyph with one meaning (#866 S4, pin-not-crown: crowns
// mean HOST in this app's chat vocabulary, so the default marker stopped wearing one). The config list
// row's pin has two arms, exactly one rendered: the DEFAULT row's pin is a solid named MARKER; every other
// row's pin is the "make this my default" BUTTON, faint-on-hover at fine pointers (rest-invisible — the
// verb is secondary chrome) and always-faint at coarse (no hover exists; an invisible control would be an
// unreachable one). The rail switcher passes `toggle`: ONE pressed/unpressed button on every row — pressing
// the pinned one clears the default — whose unpressed arm stands down at coarse into the row's actions menu
// and whose pressed arm stays visible as the state.

import { Button } from "@orb/ui/button";
import { Icon, Pin } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
// PIN_REVEAL is pointer-keyed, so it is homed in `#components/pointer-variants.ts` (the
// `no-pointer-variants-in-features` law), documented there.
import { HIDE_AT_COARSE, PIN_REVEAL } from "#components";
import { cn } from "#lib";

/** The row pin is the DEFAULT persona for new chats (the last link of `startChat`'s connected → current →
 *  default chain), not a chat's persona: a chat's card keeps whoever opened it while preset text follows the
 *  persona playing now. One sentence per state; the accessible NAME stays short and the hint is not read as
 *  a description on every row. */
const PIN_HINT_UNPINNED =
  "Pin to make this your default persona for new chats. A chat's card keeps whoever opened it ({{user}}); preset text follows who you're playing now.";
const PIN_HINT_PINNED =
  "Your default persona for new chats. A chat's card keeps whoever opened it ({{user}}); preset text follows who you're playing now. Press to clear.";

export interface PersonaPinProps {
  /** True on the row `seeds.defaultPersonaId` names — the solid-marker arm. */
  readonly isDefault: boolean;
  /** The row's announced identity (`rowActionSubject`) — the button arm embeds it (#443/#458). */
  readonly subject: string;
  /** Writes `seeds.defaultPersonaId` to this row's persona. Unused by the marker arm. */
  readonly onPin: () => void;
  /** The switcher's single pressed/unpressed button in place of the marker/button pair. */
  readonly toggle?: boolean;
  /** Clears the default — the toggle's pressed arm. Required with `toggle`. */
  readonly onUnpin?: () => void;
  /** Extra classes for the rendered element (both arms) — the list row passes `relative shrink-0` to
   *  layer above its stretched select target. */
  readonly className?: string;
}

/** The pin. The marker arm keeps its `role="img"` name at every pointer class (the crown's
 *  coarse-invisibility bug — a marker that is the state's ONLY telling may never be display-dropped). */
export function PersonaPin({ isDefault, subject, onPin, toggle = false, onUnpin, className }: PersonaPinProps): ReactElement {
  if (toggle) {
    return (
      <Tooltip describesTrigger={false}>
        <TooltipTrigger
          render={
            <Button
              aria-label={isDefault ? "Pinned — your default persona" : `Pin ${subject} as your default`}
              aria-pressed={isDefault}
              className={cn(isDefault ? "text-primary" : `${PIN_REVEAL} ${HIDE_AT_COARSE}`, className) ?? ""}
              intent="ghost"
              onClick={isDefault ? onUnpin : onPin}
              size="icon"
            >
              <Icon icon={Pin} size="sm" />
            </Button>
          }
        />
        <TooltipPopup side="top">{pinHint(isDefault)}</TooltipPopup>
      </Tooltip>
    );
  }
  if (isDefault) {
    const label = "Pinned — your default persona";
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Text as="span" aria-label={label} role="img" className={cn("text-primary", className) ?? ""}>
              <Icon icon={Pin} size="sm" />
            </Text>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    );
  }
  const label = `Pin ${subject} as your default`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={label} className={cn(PIN_REVEAL, className) ?? ""} intent="ghost" onClick={onPin} size="icon">
            <Icon icon={Pin} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

function pinHint(isDefault: boolean): string {
  return isDefault ? PIN_HINT_PINNED : PIN_HINT_UNPINNED;
}
