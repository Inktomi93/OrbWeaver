// The anchored TALKATIVENESS popover (member-row-menu.tsx's §7.1 companion — split out under the
// 450-line component cap). The mono weight CHIP is the popover's trigger/anchor AND the glance
// readout; the Members row's "Talkativeness…" Menu item opens the same controlled popover. The
// labeled `@orb/ui/slider` is arrow-key operable and commits on thumb release (Base UI
// `onValueCommitted` fires after keyboard adjustment too); Enter closes.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Slider } from "@orb/ui/slider";
import { Text } from "@orb/ui/text";
import type { ReactElement, RefObject } from "react";
import { useRef, useState } from "react";
import type { MemberCastRow } from "../lib/member-rows.ts";

// THE NUMBER IS A RELATIVE WEIGHT, AND IT MUST NOT WEAR A PERCENT SIGN (#490).
//
// `talkativeness` feeds `selectSpeakers`' Efraimidis-Spirakis weighted sample (`engine/select-speakers.ts`:
// `key = u ** (1 / weight)`, sorted desc). That is a RELATIVE weight over the eligible pool — not a
// probability, and emphatically not a share of the room. Rendered as "Talks 50%" it read as a share, so a
// three-character cast showed 50% · 50% · 50% and invited arithmetic that sums to 150 and means nothing
// (side-eye 2026-08-22). Neither number was wrong; the UNIT was. The dial keeps its familiar 0–100 domain
// (it IS the slider's own position) and loses the sign, which is the whole defect: nobody adds up levels.
/** Display factor for the 0–1 weight — the slider's position on a 0–100 dial, NOT a percentage. */
const DIAL_SCALE = 100;

/** The single-thumb scalar from a slider value (ours is single-thumb; a range carries an array). */
function firstThumb(value: number | readonly number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

/** The anchored talkativeness popover — labeled slider, arrow-key operable, commit-on-release
 *  (`onValueCommitted` fires after keyboard adjustment too); Enter closes. */
export function TalkativenessPopover({
  row,
  open,
  onOpenChange,
  onSetTalkativeness,
}: {
  readonly row: MemberCastRow;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSetTalkativeness: (characterId: CharacterId, talkativeness: number) => void;
}): ReactElement {
  // CONTROLLED from the authoritative roster value; the local override holds ONLY an in-progress drag
  // (cleared on commit) so a bus/other-device change or a failed-write revert re-seeds the thumb (the
  // roster-panel precedent — the row is keyed by member id, so a value-only change never remounts).
  const [dragValue, setDragValue] = useState<number | null>(null);
  const weight = dragValue ?? row.talkativeness;
  const initialFocusRef: RefObject<HTMLDivElement | null> = useRef(null);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            intent="ghost"
            size="sm"
            tabIndex={-1}
            // WCAG 2.5.3 Label in Name (UI-Primitives-and-Reuse §13.10): the chip READS "Talks 50%", so
            // "talks" has to be IN the name or a voice-control user saying what they see misses it. The
            // stable identity still leads (`Talkativeness: <who>`) and the live LEVEL stays suffixed, so
            // a role+name lookup on the stable prefix survives every value change. #490 spelled the unit
            // out here ("level N of 100") because an aria-label has room for what a two-glyph chip does not.
            aria-label={`Talkativeness: ${row.displayName} — talks at level ${Math.round(row.talkativeness * DIAL_SCALE)} of ${DIAL_SCALE}`}
          >
            {/* Labeled value — a bare number fails the cold read (Context-Panel-Program §1 ride-along):
                the "Talks" label names WHAT the number is; the level stays mono for column alignment.
                BOTH halves sit at the `label` step, not `micro`: this is INTERACTIVE text (the chip is the
                popover's trigger), and `design-audit` reds interactive type under the 11px functional floor
                — "being on the type ramp does not exempt it". `micro` is 10.5px. */}
            <Text as="span" voice="label">
              Talks
            </Text>
            <Text as="span" voice="datum">
              {Math.round(weight * DIAL_SCALE)}
            </Text>
          </Button>
        }
      />
      <PopoverPopup
        side="bottom"
        align="end"
        initialFocus={initialFocusRef}
        onKeyDown={(event): void => {
          if (event.key === "Enter") {
            onOpenChange(false);
          }
        }}
      >
        <Row gap="field" align="center" className="min-w-48">
          {/* The popover names the unit the chip cannot spell in two glyphs: a RELATIVE weight over the
              other speakers, which is why three members can all sit at 50 and nothing sums to 100. */}
          <Text as="span" voice="label">
            Talks relative to the others
          </Text>
          <Stack ref={initialFocusRef} tabIndex={-1} className="flex-1 outline-none">
            <Slider
              value={weight}
              min={0}
              max={1}
              step={0.05}
              thumbLabels={[`Talkativeness: ${row.displayName}`]}
              onValueChange={(value): void => setDragValue(firstThumb(value))}
              onValueCommitted={(value): void => {
                setDragValue(null);
                onSetTalkativeness(row.characterId, firstThumb(value));
              }}
            />
          </Stack>
        </Row>
      </PopoverPopup>
    </Popover>
  );
}
