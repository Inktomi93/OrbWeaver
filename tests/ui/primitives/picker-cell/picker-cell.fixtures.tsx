// picker-cell CT fixtures (Spine-Testing §7 — a CT mounts ONLY from a non-test module). The ART is
// deliberately a bare coloured box per option: this file tests the FRAME, and a real feature diagram would
// make the geometry assertions depend on somebody else's drawing.

import { PickerCell } from "@orb/ui/picker-cell";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import type { ReactElement } from "react";
import { useState } from "react";

const OPTIONS = [
  { value: "one", label: "One", description: "The first option, with a gloss long enough to wrap onto a second line at a narrow cell width." },
  { value: "two", label: "Two", description: "Short." },
  { value: "three", label: "Three" },
] as const;

/** The picker as a feature mounts it: a radiogroup of card cells, one checked. `width` picks the arm —
 *  480px WRAPS the three cells into 2 + 1 (the ragged-last-row subject), 640px keeps them on one row. */
export function PickerStory({ onPick, width = "480px" }: { readonly onPick?: (value: string) => void; readonly width?: string }): ReactElement {
  const [value, setValue] = useState<string>("one");
  return (
    // `containerType: inline-size` is the picker's own contract, not test scaffolding: its column steps
    // are CONTAINER queries, so a host without one degrades (honestly) to a single column.
    <div data-testid="picker-host" style={{ containerType: "inline-size", width }}>
      <RadioGroupPicker
        aria-label="Sample picker"
        onValueChange={(next): void => {
          setValue(next as string);
          onPick?.(next as string);
        }}
        value={value}
      >
        {OPTIONS.map((option) => (
          <RadioGroupPickerItem
            key={option.value}
            art={<div data-testid={`art-${option.value}`} style={{ height: "100%", width: "100%" }} />}
            {...("description" in option ? { description: option.description } : {})}
            idPrefix={`picker-${option.value}`}
            label={option.label}
            value={option.value}
          />
        ))}
      </RadioGroupPicker>
    </div>
  );
}

/** The frame with NO interaction wired — the presentation-only mount (a menu row's preview). */
export function BarePickerCellStory(): ReactElement {
  return (
    <div data-testid="bare-host" style={{ containerType: "inline-size", width: "240px" }}>
      <PickerCell art={<div data-testid="art-bare" style={{ height: "100%", width: "100%" }} />} label="Bare" meta="current" shape="square" />
    </div>
  );
}
