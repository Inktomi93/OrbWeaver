// setting-switch-row — the label-left / control-right settings row, promoted off
// `appearance-effects-section.tsx`'s local `EffectSwitchRow` (C21 — the shared-id `SettingRow` +
// `Switch`/`Checkbox` wiring was hand-rolled 3× across appearance/persona/export-library). ONE
// `eslint-disable` here instead of three: `SettingRow` renders the associated `<label htmlFor={id}>`
// via the shared `id` prop, a real (runtime) label association the linter can't see across the
// component boundary.

import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

interface SettingRowControlProps {
  readonly id: string;
  readonly label: string;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly onBlur?: () => void;
  /** Inapplicable-right-now (never hidden — the row still states what it would do). Pair it with
   *  `disabledReason`: `SettingRow` renders that note under the row, which is the ONLY thing that turns a
   *  dead control into an honest one. */
  readonly disabled?: boolean;
  readonly disabledReason?: ReactNode;
}

/** One label-left / switch-right settings row (the on/off-effect shape). */
export function SettingSwitchRow({ label, description, checked, onChange, onBlur }: SettingRowControlProps): ReactElement {
  return (
    <Field label={label} orientation="horizontal" {...(description === undefined ? {} : { description })}>
      <Switch checked={checked} onCheckedChange={onChange} {...(onBlur === undefined ? {} : { onBlur })} />
    </Field>
  );
}

export function SettingCheckboxRow({ label, description, checked, onChange, onBlur, disabled, disabledReason }: SettingRowControlProps): ReactElement {
  const combinedDescription = (
    <>
      {description}
      {disabledReason !== undefined && <Text tone="muted">{disabledReason}</Text>}
    </>
  );

  return (
    <Field label={label} orientation="horizontal" {...(description === undefined && disabledReason === undefined ? {} : { description: combinedDescription })}>
      <Checkbox
        checked={checked}
        onCheckedChange={(next): void => onChange(next === true)}
        {...(onBlur === undefined ? {} : { onBlur })}
        {...(disabled === undefined ? {} : { disabled })}
      />
    </Field>
  );
}
