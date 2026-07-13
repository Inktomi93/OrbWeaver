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
import type { MemberCastRow } from "../lib/member-rows";

/** Percent display factor for the 0–1 talkativeness weight. */
const PERCENT = 100;

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
            aria-label={`Talkativeness: ${row.displayName} — ${Math.round(row.talkativeness * PERCENT)}%`}
            className="font-mono"
          >
            {Math.round(weight * PERCENT)}%
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
          <Text as="span" size="label" tone="muted">
            Talkativeness
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
