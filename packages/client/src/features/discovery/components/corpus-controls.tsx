// The corpus capability-param controls (D62 compact: a micro-caps label over a primitive control, no
// settings-page sprawl). Shared by the analytics tabs that expose a compute knob — archetypes `k`,
// similarity `minSimilarity`/`maxNodes`, the theme-drift `level` axis, the visuals facet drill. The
// control heights stay pointer-conditional via the underlying Select/ToggleGroup primitives; this only
// dresses them with the micro-caps section voice.

import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";

/** A labelled compact Select — the micro-caps label names the knob; the Select is the control. */
export function ParamSelect({
  label,
  value,
  items,
  onValueChange,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly items: SelectItems<string>;
  readonly onValueChange: (value: string) => void;
  readonly testId?: string;
}): ReactElement {
  return (
    <Stack gap="field">
      <Text size="micro" weight="semibold" tone="muted" transform="caps">
        {label}
      </Text>
      <Select
        items={items}
        value={value}
        onValueChange={(next): void => onValueChange(next as string)}
        aria-label={label}
        {...(testId === undefined ? {} : { "data-testid": testId })}
      />
    </Stack>
  );
}

/** One option for {@link ParamToggle} — a value plus the human label its toggle shows. */
export interface ParamToggleOption {
  readonly value: string;
  readonly label: string;
}

/** A labelled single-select ToggleGroup — the compact axis switch (e.g. scene ↔ arc). */
export function ParamToggle({
  label,
  value,
  options,
  onValueChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly ParamToggleOption[];
  readonly onValueChange: (value: string) => void;
}): ReactElement {
  return (
    <Row align="center" gap="field" className="flex-wrap">
      <Text size="micro" weight="semibold" tone="muted" transform="caps">
        {label}
      </Text>
      <ToggleGroup
        aria-label={label}
        value={[value]}
        onValueChange={(picked): void => {
          const next = picked[0];
          if (next !== undefined) {
            onValueChange(next);
          }
        }}
      >
        {options.map((option) => (
          <Toggle key={option.value} value={option.value} aria-label={option.label}>
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </Row>
  );
}
