// The two state glyphs a switcher row can wear that are never controls: playing (check) and connected to the
// open room's one character (link). The pin and the crown are toggles of their own (`persona-card-pin.tsx`,
// `persona-crown.tsx`).

import type { LucideIcon } from "@orb/ui/icons";
import { Check, Icon, Link2 } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";

/** ✓ — the persona on the viewer's seat. `seatBindsPresets`: preset text follows the seat too (ADR 0250). */
export function PlayingGlyph({ seatBindsPresets }: { readonly seatBindsPresets: boolean }): ReactElement {
  return (
    <StateGlyph
      hint={seatBindsPresets ? "Your lines and preset text use this persona." : "Your lines use this persona."}
      icon={Check}
      label="Playing as"
      seatBinds={seatBindsPresets ? "lines-and-presets" : "lines"}
    />
  );
}

/** 🔗 — connected to the open room's one character. Connect or disconnect in the editor or the character's Links tab. */
export function ConnectedGlyph({ characterName }: { readonly characterName: string }): ReactElement {
  const label = `Connected to ${characterName}`;
  return <StateGlyph hint={label} icon={Link2} label={label} />;
}

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
