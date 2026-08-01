// The AppSettings admin-override rows (Phase B ③) — the HONEST floor-vs-override controls: each shows the
// effective value, whether it is an active override or the deployment floor, and names the floor. Numeric
// rows are draft-edited (the parent batches a Save delta); the enum + boolean rows write immediately.
//
// CLEAR is SECTION-level, not per-field, for the NESTED AppSettings objects (memoryDefaults /
// memorySummarizer / rateLimits): the deep-merge write path clears only a TOP-LEVEL key, and a nested
// `null` fails the inner schema and trips that SECTION field's `.catch(undefined)` — silently dropping the
// section's entire override set (every sibling knob), though OTHER sections' overrides survive
// (empirically verified 2026-07-26; the one exception is a leaf explicitly `.nullable()` in the schema,
// which is how `engineLaunch.genPresencePenalty` clears alone). Per-leaf null-clear is therefore generally
// broken, so `AdminOverrideResetRow` resets a section's OWN claimed keys — the whole nested override for a
// nested section (`{ <section>: null }`), the flat keys for a section of top-level scalars (SET-SEAMS stage
// 4). Per-field overridden indicators still show which knobs are off-floor.
//
// A components/ leaf (no CSS, tokens/variants only via @orb/ui primitives) shared by every admin override
// section.

import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { SettingRow } from "@orb/ui/setting-row";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ChangeEvent, ReactElement } from "react";
import { useId } from "react";

/** The muted "Overridden / Using the default" line beneath every override control. A `null` `floorLabel`
 *  means the caller CANNOT name the floor (an env-layered key whose override hides it — see
 *  `envFloorLabel`): say so instead of printing the stored override as if it were the default. */
function floorDescription(overridden: boolean, floorLabel: string | null): string {
  if (!overridden) {
    return `Using the deployment default: ${floorLabel ?? "the environment value"}.`;
  }
  return floorLabel === null ? "Overridden. Reset to fall back to this deployment's default." : `Overridden. Default: ${floorLabel}.`;
}

export interface AdminOverrideFieldProps {
  readonly label: string;
  readonly hint?: string;
  /** The current draft text (parent-owned). */
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** `true` when a stored override is active for this field (vs the deployment floor governing). */
  readonly overridden: boolean;
  /** The floor value shown beneath the control ("Default: N") — the value an absent override falls to. */
  readonly floorLabel: string | null;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
}

/** One numeric AppSettings-override row, with the floor named beneath so the admin always sees the default. */
export function AdminOverrideField({ label, hint, value, onChange, overridden, floorLabel, min, max, step, disabled }: AdminOverrideFieldProps): ReactElement {
  const id = useId();
  return (
    <SettingRow id={id} label={label} description={floorDescription(overridden, floorLabel)} {...(hint === undefined ? {} : { hint })}>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>): void => onChange(e.target.value)}
        {...(min === undefined ? {} : { min })}
        {...(max === undefined ? {} : { max })}
        {...(step === undefined ? {} : { step })}
        {...(disabled === true ? { disabled: true } : {})}
      />
    </SettingRow>
  );
}

export interface AdminOverrideSwitchProps {
  readonly label: string;
  readonly hint?: string;
  /** The EFFECTIVE value (floor ⊕ override) — what the control shows. */
  readonly value: boolean;
  readonly overridden: boolean;
  readonly floorLabel: string | null;
  /** Set an override to `next` (immediate — a toggle IS the override). */
  readonly onSet: (next: boolean) => void;
  readonly disabled?: boolean;
}

/** A boolean AppSettings-override row (immediate-write; a toggle is one value, no draft/save). */
export function AdminOverrideSwitch({ label, hint, value, overridden, floorLabel, onSet, disabled }: AdminOverrideSwitchProps): ReactElement {
  const id = useId();
  return (
    <SettingRow id={id} label={label} description={floorDescription(overridden, floorLabel)} {...(hint === undefined ? {} : { hint })}>
      <Switch id={id} checked={value} onCheckedChange={onSet} {...(disabled === true ? { disabled: true } : {})} />
    </SettingRow>
  );
}

export interface AdminOverrideSelectProps {
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly items: SelectItems<string>;
  readonly overridden: boolean;
  readonly floorLabel: string | null;
  readonly onSet: (next: string) => void;
  readonly disabled?: boolean;
}

/** An enum AppSettings-override row (immediate-write). Base UI's Select can emit `null`; ignore it (the
 *  control never clears to null — clear is the section reset). */
export function AdminOverrideSelect({ label, hint, value, items, overridden, floorLabel, onSet, disabled }: AdminOverrideSelectProps): ReactElement {
  const id = useId();
  return (
    <SettingRow id={id} label={label} description={floorDescription(overridden, floorLabel)} {...(hint === undefined ? {} : { hint })}>
      <Select
        aria-label={label}
        items={items}
        value={value}
        onValueChange={(next): void => {
          if (next !== null) {
            onSet(next);
          }
        }}
        {...(disabled === true ? { disabled: true } : {})}
      />
    </SettingRow>
  );
}

export interface AdminOverrideResetRowProps {
  /** Enable Save — the draft carries a not-yet-saved change. Omit WITH `onSave` for a section whose
   *  controls all write immediately (a switch/select stack has no draft, so a permanently-disabled Save
   *  button would be dead chrome). */
  readonly dirty?: boolean;
  /** Any field in this nested section is an active override (shows "Reset to defaults"). */
  readonly anyOverridden: boolean;
  readonly saving: boolean;
  readonly errored: boolean;
  readonly onSave?: () => void;
  /** Clear this section's OWN override keys to the floor. */
  readonly onReset: () => void;
}

/** The Save + Reset-to-defaults row shared by the admin override sections. Save renders only for a section
 *  that HAS a draft; Reset appears only when the section has an active override. */
export function AdminOverrideResetRow({ dirty, anyOverridden, saving, errored, onSave, onReset }: AdminOverrideResetRowProps): ReactElement {
  return (
    <Stack gap="field">
      <Row gap="field" align="center">
        {onSave === undefined ? null : (
          <Button intent="primary" size="sm" disabled={dirty !== true || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
        {anyOverridden ? (
          <Button intent="secondary" size="sm" disabled={saving} onClick={onReset}>
            Reset to defaults
          </Button>
        ) : null}
      </Row>
      {errored ? (
        <Text size="label" tone="destructive">
          Couldn't save — administrators only.
        </Text>
      ) : null}
    </Stack>
  );
}
