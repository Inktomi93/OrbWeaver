// The PIN — the default-persona affordance, ONE glyph with one meaning (#866 S4, pin-not-crown: crowns
// mean HOST in this app's chat vocabulary). One toggle on every row, in the switcher and the Settings list
// alike: pressed on the default row, where pressing it clears the default (the caller offers Undo); every
// other row's pin is "make this my default", faint until its row is hovered or keyboard-focused. At a coarse
// pointer there is no hover, so the toggle stands down: the verb lives in the row's actions menu and the
// default row keeps a quiet, non-interactive marker as its state — the pressed pin may never be the one
// thing a phone cannot see.

import { Button } from "@orb/ui/button";
import { Icon, Pin } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
// PIN_REVEAL is pointer-keyed, so it is homed in `#components/pointer-variants.ts` (the
// `no-pointer-variants-in-features` law), documented there.
import { HIDE_AT_COARSE, PIN_REVEAL, ROW_ACTION_OVERFLOW } from "#components";
import { cn } from "#lib";

/** The row pin is the DEFAULT persona for new chats (the last link of `startChat`'s connected → current →
 *  default chain), not a chat's persona: a chat's card keeps whoever opened it while preset text follows the
 *  persona playing now. One sentence per state; the accessible NAME stays short and the hint is not read as
 *  a description on every row. */
const PIN_HINT_UNPINNED =
  "Pin to make this your default persona for new chats. A chat's card keeps whoever opened it ({{user}}); preset text follows who you're playing now.";
const PIN_HINT_PINNED =
  "Your default persona for new chats. A chat's card keeps whoever opened it ({{user}}); preset text follows who you're playing now. Press to clear.";
const PINNED_LABEL = "Pinned — your default persona";

export interface PersonaPinProps {
  /** True on the row `seeds.defaultPersonaId` names — the pressed state. */
  readonly isDefault: boolean;
  /** The row's announced identity (`rowActionSubject`) — the unpressed name embeds it (#443/#458). */
  readonly subject: string;
  /** Writes `seeds.defaultPersonaId` to this row's persona. */
  readonly onPin: () => void;
  /** Clears the default — the pressed pin's press. */
  readonly onUnpin: () => void;
  /** Roving focus: `-1` takes the pin out of the tab order while its row is not the list's tab stop. */
  readonly tabIndex?: -1;
  /** Extra classes for the rendered elements — the row passes `relative shrink-0` to layer above its
   *  stretched select target. */
  readonly className?: string;
}

export function PersonaPin({ isDefault, subject, onPin, onUnpin, tabIndex, className }: PersonaPinProps): ReactElement {
  const tabProps = tabIndex === undefined ? {} : { tabIndex };
  return (
    <>
      <Tooltip describesTrigger={false}>
        <TooltipTrigger
          render={
            <Button
              aria-label={isDefault ? `${subject} is pinned as your default` : `Pin ${subject} as your default`}
              aria-pressed={isDefault}
              className={cn(isDefault ? "text-primary" : PIN_REVEAL, HIDE_AT_COARSE, className) ?? ""}
              intent="ghost"
              onClick={isDefault ? onUnpin : onPin}
              size={isDefault ? "inline" : "icon"}
              {...tabProps}
            >
              <Icon icon={Pin} size="sm" />
            </Button>
          }
        />
        <TooltipPopup side="top">{pinHint(isDefault)}</TooltipPopup>
      </Tooltip>
      {isDefault ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Text as="span" aria-label={PINNED_LABEL} className={cn("text-primary", ROW_ACTION_OVERFLOW, className) ?? ""} role="img">
                <Icon icon={Pin} size="sm" />
              </Text>
            }
          />
          <TooltipPopup side="top">{PINNED_LABEL}</TooltipPopup>
        </Tooltip>
      ) : null}
    </>
  );
}

function pinHint(isDefault: boolean): string {
  return isDefault ? PIN_HINT_PINNED : PIN_HINT_UNPINNED;
}
