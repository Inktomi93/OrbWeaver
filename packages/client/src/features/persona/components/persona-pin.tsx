// The PIN — the default-persona affordance, ONE glyph with one meaning (#866 S4, pin-not-crown: crowns
// mean HOST in this app's chat vocabulary, so the default marker stopped wearing one). Two arms, exactly
// one rendered: the DEFAULT row's pin is a solid named MARKER (there is no "unpin" verb — a default always
// exists while you own a persona, so the solid pin has nothing to do and is honest as state); every other
// row's pin is the "make this my default" BUTTON, faint-on-hover at fine pointers (rest-invisible — the
// verb is secondary chrome) and always-faint at coarse (no hover exists; an invisible control would be an
// unreachable one). Shared by the roster row and the rail switcher's rows so the two mounts cannot drift.

import { Button } from "@orb/ui/button";
import { Icon, Pin } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
// PIN_REVEAL is pointer-keyed, so it is homed in `#components/pointer-variants.ts` (the
// `no-pointer-variants-in-features` law), documented there.
import { PIN_REVEAL } from "#components";
import { cn } from "#lib";

export interface PersonaPinProps {
  /** True on the row `seeds.defaultPersonaId` names — the solid-marker arm. */
  readonly isDefault: boolean;
  /** The row's announced identity (`rowActionSubject`) — the button arm embeds it (#443/#458). */
  readonly subject: string;
  /** Writes `seeds.defaultPersonaId` to this row's persona. Unused by the marker arm. */
  readonly onPin: () => void;
  /** Extra classes for the rendered element (both arms) — the roster row passes `relative shrink-0` to
   *  layer above its stretched select target. */
  readonly className?: string;
}

/** The pin, both arms. The marker arm keeps its `role="img"` name at every pointer class (the crown's
 *  coarse-invisibility bug — a marker that is the state's ONLY telling may never be display-dropped). */
export function PersonaPin({ isDefault, subject, onPin, className }: PersonaPinProps): ReactElement {
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
