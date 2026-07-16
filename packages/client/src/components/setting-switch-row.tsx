// setting-switch-row — the label-left / control-right settings row, promoted off
// `appearance-effects-section.tsx`'s local `EffectSwitchRow` (C21 — the shared-id `SettingRow` +
// `Switch`/`Checkbox` wiring was hand-rolled 3× across appearance/persona/export-library). ONE
// `eslint-disable` here instead of three: `SettingRow` renders the associated `<label htmlFor={id}>`
// via the shared `id` prop, a real (runtime) label association the linter can't see across the
// component boundary.

import { Checkbox } from "@orb/ui/checkbox";
import { SettingRow } from "@orb/ui/setting-row";
import { Switch } from "@orb/ui/switch";
import type { ReactElement, ReactNode } from "react";

interface SettingRowControlProps {
  readonly id: string;
  readonly label: string;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly onBlur?: () => void;
}

/** One label-left / switch-right settings row (the on/off-effect shape). */
export function SettingSwitchRow({ id, label, description, checked, onChange, onBlur }: SettingRowControlProps): ReactElement {
  return (
    <SettingRow id={id} label={label} {...(description === undefined ? {} : { description })}>
      {/* a11y: SettingRow renders the associated `<label htmlFor={id}>` — the shared id is the real label
          wiring, invisible at this control. */}
      <Switch id={id} checked={checked} onCheckedChange={onChange} {...(onBlur === undefined ? {} : { onBlur })} />
    </SettingRow>
  );
}

/** The checkbox sibling (the multi-pick-from-a-set shape, e.g. "which kinds to include"). */
export function SettingCheckboxRow({ id, label, description, checked, onChange, onBlur }: SettingRowControlProps): ReactElement {
  return (
    <SettingRow id={id} label={label} {...(description === undefined ? {} : { description })}>
      {/* a11y: SettingRow renders the associated `<label htmlFor={id}>` — the shared id is the real label
          wiring, invisible at this control. */}
      <Checkbox id={id} checked={checked} onCheckedChange={(next): void => onChange(next === true)} {...(onBlur === undefined ? {} : { onBlur })} />
    </SettingRow>
  );
}
