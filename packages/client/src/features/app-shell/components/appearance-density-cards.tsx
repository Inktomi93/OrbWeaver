// The density PICKER as ILLUSTRATED CELLS (#866 §7.8 seen-not-read, rebuilt for #929 E6 / #1099 F9).
//
// WHAT IT REPLACES, AND WHY. Density was a `SegmentField` (a two-option ToggleGroup) with a SEPARATE live
// preview underneath it. Two defects fell out of that one shape. (1) The segment did not fit: measured
// 114x34 over 90x34 inside a `role="group"` 200px wide — 114 + gap + 90 = 207 — so the two halves of one
// control stacked into a ragged column (F9). (2) The preview was DETACHED: it showed only the option you
// had already picked, so choosing between two spacings meant picking one, looking down, and picking the
// other to compare. Folding the spacing art INTO each option answers both — the two pictures sit side by
// side at the moment of choosing, and the cells share the app's one picker grid instead of a bespoke one.
//
// THE ART IS THE DEFINITION, NEVER A COPY. Each cell's mini stack carries `data-density` set to THAT
// option's value, and tiers.css's symmetric density map re-scopes the four spacing tokens for the subtree
// exactly as it does for the shell carrier — so the gaps and padding a cell draws ARE what picking it
// does. Ornament, so the whole picture is `aria-hidden` inside the cell's art aperture.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { Row, Stack } from "@orb/ui/layout";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { DENSITY_ITEMS } from "#lib";

type Density = AppearanceSettings["density"];

/** Three mock rows at one density tier — the live spacing map, scoped by `data-density`. The prop is
 *  `tier`, not `density`: `density` is a banned layout-context PROP name (`no-layout-context-props` — the
 *  container model owns that word, and the axis travels as the `data-density` ATTRIBUTE, which is exactly
 *  what this box stamps). */
function DensityDiagram({ tier }: { readonly tier: Density }): ReactElement {
  return (
    <Stack className="h-full w-full justify-center p-tight" data-density={tier} data-slot="density-preview" gap="row">
      {["The first row", "A second row", "And a third"].map((line) => (
        <Row key={line} align="center" className="min-w-0 rounded-control bg-accent p-field" gap="field">
          <Text as="span" className="truncate" voice="gloss">
            {line}
          </Text>
        </Row>
      ))}
    </Stack>
  );
}

export interface DensityCardsProps {
  readonly value: Density;
  readonly onPick: (value: Density) => void;
  readonly onBlur?: () => void;
}

/** ONE radiogroup — one tab stop, roving focus, arrows change selection (#981 F20). */
export function DensityCards({ value, onPick, onBlur }: DensityCardsProps): ReactElement {
  const ids = useId();
  return (
    <RadioGroupPicker aria-label="Density" data-slot="density-cards" onBlur={onBlur} onValueChange={(next): void => onPick(next as Density)} value={value}>
      {DENSITY_ITEMS.map((item) => (
        <RadioGroupPickerItem
          key={item.value}
          art={<DensityDiagram tier={item.value as Density} />}
          idPrefix={`${ids}-${item.value}`}
          label={item.label}
          value={item.value}
        />
      ))}
    </RadioGroupPicker>
  );
}
