// The icon-picker popover body — the curated `ITEM_ICON_CHOICES` grid; picking writes the name. The pack's items and the
// Game tab's trackers pick from the one catalog, so a glyph reads the same wherever the host chose it.
//
// THE COARSE GAP IS THE TOUCH FLOOR (an owner ruling). A `glyph="lg"` GlyphButton is FLOORLESS — its coarse
// hit area rides an OVERFLOWING `::after`, not its own box — so on a wrapped grid the pseudo is clipped by the
// gap it shares with the next cell and the effective hit box falls under the floor. `gap-block` makes the
// coarse pitch exactly the touch target, and the FINE picker is untouched (still `gap-field`). The cost is
// one fewer column and a taller popover at coarse.

import { GlyphButton } from "@orb/ui/glyph-button";
import { Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { Tip } from "#components";
import { ITEM_ICON_CHOICES } from "../lib/glyphs.ts";

/** `subject` is what the icon is for (an item or tracker name), so each choice's name says whose icon it sets. */
export function IconPicker({ subject, onPick }: { readonly subject: string; readonly onPick: (icon: string) => void }): ReactElement {
  return (
    <Row gap="field" touchFloor="gap" wrap={true} cap="control">
      {Object.entries(ITEM_ICON_CHOICES).map(([name, glyph]) => (
        <Tip key={name} text={`${subject}: use the ${name} icon`}>
          {/* eslint-disable-next-line orb/no-floorless-control-in-wrap -- touchFloor="gap" supplies the measured touch-target pitch without changing the fine picker; ends when this geometry or floorless size changes. */}
          <GlyphButton aria-label={`${subject}: use the ${name} icon`} variant="ghost" glyph="lg" onClick={(): void => onPick(name)}>
            <Icon icon={glyph} size="sm" />
          </GlyphButton>
        </Tip>
      ))}
    </Row>
  );
}
