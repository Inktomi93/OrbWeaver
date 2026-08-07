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
   *  `disabledReason`: BOTH arms render that note in the row's description, which is the ONLY thing that
   *  turns a dead control into an honest one. */
  readonly disabled?: boolean;
  readonly disabledReason?: ReactNode;
}

// The DESCRIPTION half of the inapplicable-state contract, shared by both arms (side-eye 2026-08-06 P2 — the
// switch arm accepted `disabled`/`disabledReason` in this shared props type and then destructured neither,
// so the first call site to reach for them would have got a fully live switch with no note and no compile
// error. No live call site passes them yet, which is exactly why it had to be fixed rather than found later:
// a prop a component ADVERTISES and silently drops is a trap, and the honest arms are "honour it" or "make
// it unrepresentable" — honour it, because an inapplicable on/off knob is the same shape as an inapplicable
// checkbox and `Switch` takes `disabled` natively.)
//
// The reason rides the DESCRIPTION slot (the old `SettingRow` had a dedicated one). That keeps it both
// visible and in `aria-describedby` — Base UI's `Field.Description` registers its id there — so a dead
// control still states why. `as="span"` is load-bearing: `Field.Description` renders a `<p>`, and the
// default `<Text>` is also a `<p>`, so the nested default trips React's DOM-nesting validation and puts a
// paragraph inside a paragraph. `block` restores the own-line break the `<p>` was providing.
function describeRow(description: ReactNode, disabledReason: ReactNode): { readonly description?: ReactNode } {
  if (description === undefined && disabledReason === undefined) {
    return {};
  }
  return {
    description: (
      <>
        {description}
        {disabledReason !== undefined && (
          <Text as="span" className="block" tone="muted">
            {disabledReason}
          </Text>
        )}
      </>
    ),
  };
}

/** One label-left / switch-right settings row (the on/off-effect shape). */
export function SettingSwitchRow({ label, description, checked, onChange, onBlur, disabled, disabledReason }: SettingRowControlProps): ReactElement {
  return (
    <Field label={label} orientation="horizontal" {...describeRow(description, disabledReason)}>
      <Switch checked={checked} onCheckedChange={onChange} {...(onBlur === undefined ? {} : { onBlur })} {...(disabled === undefined ? {} : { disabled })} />
    </Field>
  );
}

export function SettingCheckboxRow({ label, description, checked, onChange, onBlur, disabled, disabledReason }: SettingRowControlProps): ReactElement {
  return (
    <Field label={label} orientation="horizontal" {...describeRow(description, disabledReason)}>
      <Checkbox
        checked={checked}
        onCheckedChange={(next): void => onChange(next === true)}
        {...(onBlur === undefined ? {} : { onBlur })}
        {...(disabled === undefined ? {} : { disabled })}
      />
    </Field>
  );
}
