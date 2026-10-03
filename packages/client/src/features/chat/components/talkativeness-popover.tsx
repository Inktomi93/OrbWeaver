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
import { talkativenessAccessibleName, talkativenessPercent, talkativenessReadout } from "#lib";
import type { MemberCharacterRow } from "../lib/member-rows.ts";

// The percent, its rounding and the spelled-out accessible name live in ONE home, `#lib`'s
// `talkativeness.ts`, because the saved-roster editor renders the same seat knob; a feature may not import
// another feature, so the seam sits on the tier-4 floor. Why it is a percent is said there.

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
  readonly row: MemberCharacterRow;
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
    <Popover modal={true} onOpenChange={onOpenChange} open={open}>
      {/* `modal` — this popover carries INPUT; the rule + its receipt live on `Popover` in @orb/ui's popover.tsx (#2444). */}
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
            // a role+name lookup on the stable prefix survives every value change. The name also says what
            // the percent is a chance of, which the chip has no room to spell.
            aria-label={talkativenessAccessibleName(row.displayName, row.talkativeness)}
          >
            {/* Labeled value — a bare number fails the cold read:
                the "Talks" label names WHAT the number is; the level stays mono for column alignment.
                BOTH halves sit at the `label` step, not `micro`: this is INTERACTIVE text (the chip is the
                popover's trigger), and `design-audit` reds interactive type under the 11px functional floor
                — "being on the type ramp does not exempt it". `micro` is 10.5px. */}
            <Text as="span" voice="label">
              Talks
            </Text>
            <Text as="span" voice="datum">
              {talkativenessPercent(weight)}
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
        <Stack gap="field" className="min-w-48">
          <Row gap="field" align="center">
            {/* The popover spells what the chip's percent is a chance OF, live with the thumb. */}
            <Text as="span" voice="label">
              {talkativenessReadout(weight)}
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
          {/* When the chance applies is `engine/select-speakers.ts`: only the natural order and Smart's
              fallback roll it. */}
          <Text voice="gloss">
            Counts in a Natural room, where anyone you name replies anyway. At 0% a character replies only when named, or when every character is at 0%. Smart
            uses it only when it can't decide.
          </Text>
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}
