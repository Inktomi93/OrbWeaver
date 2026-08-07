// setting-switch-row — the label-left / control-right settings row, promoted off
// `appearance-effects-section.tsx`'s local `EffectSwitchRow` (C21 — the shared-id `SettingRow` +
// `Switch`/`Checkbox` wiring was hand-rolled 3× across appearance/persona/export-library).
//
// IDENTITY IS INHERITED, NOT PASSED (LANE NAVFORM). The row used to take an `id` and hand it to a
// `SettingRow` that rendered `<label htmlFor={id}>`; every call site minted one with `useId()`. Both
// halves are gone: `@orb/ui/field` is Base UI's `Field`, whose `Field.Label` and control agree on an id
// MINTED FROM FIELD CONTEXT (`useLabelableId`) with no plumbing — so a passed id was, by the end, accepted
// and silently dropped. The prop and the nine call-site `useId()`s died with it. A row that genuinely
// needs a STABLE id (a deep link, a test selector) passes it to the control, deliberately and with a
// reason; nothing here does.

import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

interface SettingRowControlProps {
  readonly label: string;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly onBlur?: () => void;
  /** Inapplicable-right-now (never hidden — the row still states what it would do). Pair it with
   *  `disabledReason`: `SettingCheckboxRow` renders that note in the row's description, which is the ONLY
   *  thing that turns a dead control into an honest one. */
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
  // The reason rides the DESCRIPTION slot (the old `SettingRow` had a dedicated one). That keeps it both
  // visible and in `aria-describedby` — Base UI's `Field.Description` registers its id there — so a dead
  // control still states why. `as="span"` is load-bearing: `Field.Description` renders a `<p>`, and the
  // default `<Text>` is also a `<p>`, so the nested default trips React's DOM-nesting validation and puts a
  // paragraph inside a paragraph. `block` restores the own-line break the `<p>` was providing.
  const combinedDescription = (
    <>
      {description}
      {disabledReason !== undefined && (
        <Text as="span" className="block" tone="muted">
          {disabledReason}
        </Text>
      )}
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
