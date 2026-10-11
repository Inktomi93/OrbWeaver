// The persona states a row can wear, one glyph each: playing as (check) and the room's card persona (card).
// The third state, the default, is the pin beside them (`PersonaPin`). Shared by the switcher's rows and the
// Settings list's rows so the two surfaces cannot drift. Glyphs are state, not controls.

import type { LucideIcon } from "@orb/ui/icons";
import { Check, Icon, IdCard } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";

export interface PersonaStateMarkersProps {
  /** This persona is the one playing (the seat in a room, else the global pointer). */
  readonly isCurrent: boolean;
  /** This persona is the open room's card persona — what the card's `{{user}}` means. */
  readonly isCardPin: boolean;
  /** The persona's name, for the card marker's sentence. */
  readonly name: string;
  /** True when preset text follows the viewer's seat (no room, or the viewer is the anchor human, ADR 0250). */
  readonly seatBindsPresets: boolean;
}

export function PersonaStateMarkers({ isCurrent, isCardPin, name, seatBindsPresets }: PersonaStateMarkersProps): ReactElement {
  return (
    <>
      {isCurrent ? (
        <StateGlyph
          hint={seatBindsPresets ? "Your lines and preset text use this persona." : "Your lines use this persona."}
          icon={Check}
          label="Playing as"
          seatBinds={seatBindsPresets ? "lines-and-presets" : "lines"}
        />
      ) : null}
      {isCardPin ? <StateGlyph hint={`This chat's card calls you ${name} ({{user}}).`} icon={IdCard} label="Card's persona in this chat" /> : null}
    </>
  );
}

/** A state glyph with its short tooltip. Not a control: the row's one button already switches. */
function StateGlyph({
  icon,
  label,
  hint,
  seatBinds,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly hint: string;
  readonly seatBinds?: "lines" | "lines-and-presets";
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Text
            as="span"
            aria-label={label}
            className="relative shrink-0 text-muted-foreground"
            role="img"
            {...(seatBinds === undefined ? {} : { "data-seat-binds": seatBinds })}
          >
            <Icon icon={icon} size="sm" />
          </Text>
        }
      />
      <TooltipPopup side="top">{hint}</TooltipPopup>
    </Tooltip>
  );
}
