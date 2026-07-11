// The "Effects" appearance section — split out of appearance-settings-surface.tsx (§2.1 component-size)
// AND redesigned to the settings-row grammar (owner ruling: the old ToggleGroup multi-select + a dangling
// "Enable" button read ugly). By value type (§13.8 R4): the frosted-glass surfaces are INDEPENDENT
// on/off effects, so each is its own label-left / switch-right `@orb/ui/setting-row` row (a toggle-group
// would imply exclusivity/segmentation, which is wrong here) — every switch toggles membership in the one
// `blurSurfaces` array field, so the autosave binding law is intact (all state still flows through
// `form.AppField`). `blurStrength` stays a slider (a continuous value); Prose shadow + accent tint join
// the same clean switch-row list.

import type { AppearanceSettings, BlurSurface } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { SettingRow } from "@orb/ui/setting-row";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { AppFormInstance } from "#forms";
import { BLUR_STRENGTH_MAX, BLUR_STRENGTH_MIN } from "../lib/appearance-bounds";
import { BLUR_SURFACE_ITEMS } from "../lib/appearance-select-items";
import { APPEARANCE_SUBCATEGORY_IDS } from "../lib/settings-nav";
import { settingsAnchorId } from "../lib/settings-nav-model";

/** One label-left / switch-right effect row. The label association is the shared `id` SettingRow wires
 *  via `htmlFor` — a real (runtime) association the linter can't see across the component boundary. */
function EffectSwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  onBlur,
}: {
  readonly id: string;
  readonly label: string;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly onBlur: () => void;
}): ReactElement {
  return (
    <SettingRow id={id} label={label} {...(description === undefined ? {} : { description })}>
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- SettingRow renders the
          associated `<label htmlFor={id}>`; the shared id is the real label wiring, invisible here. */}
      <Switch id={id} checked={checked} onBlur={onBlur} onCheckedChange={onChange} />
    </SettingRow>
  );
}

export function AppearanceEffectsSection({
  form,
}: {
  readonly form: Omit<AppFormInstance<AppearanceSettings>, "reset">;
}): ReactElement {
  const glassId = useId();
  const shadowId = useId();
  const tintId = useId();
  return (
    <Section
      divider={true}
      heading="Effects"
      id={settingsAnchorId("appearance", APPEARANCE_SUBCATEGORY_IDS.effects)}
    >
      <Stack gap="field">
        <Text size="label">Frosted glass</Text>
        <Text size="micro" tone="muted">
          Backdrop blur + a translucent fill on the surfaces you pick. Messages carry glass poorly
          (scrolling prose over blur), so they stay off unless you opt in.
        </Text>
        <form.AppField name="blurSurfaces">
          {(field): ReactElement => (
            <Stack gap="field">
              {BLUR_SURFACE_ITEMS.map((item) => {
                // item.value is a BlurSurface by construction (BLUR_SURFACE_ITEMS is built from
                // BLUR_SURFACES); the SelectOption shape widens it to string, so re-narrow at the toggle.
                const surface = item.value as BlurSurface;
                return (
                  <EffectSwitchRow
                    key={item.value}
                    id={`${glassId}-${item.value}`}
                    label={item.label}
                    checked={field.state.value.includes(surface)}
                    onBlur={field.handleBlur}
                    onChange={(next): void =>
                      field.handleChange(
                        next
                          ? [...field.state.value, surface]
                          : field.state.value.filter((value) => value !== surface),
                      )
                    }
                  />
                );
              })}
            </Stack>
          )}
        </form.AppField>
      </Stack>
      <form.AppField name="blurStrength">
        {(field): ReactElement => (
          <field.SliderField
            label="Glass blur radius"
            description="How strong the frosted-glass blur is, for any surface enabled above."
            min={BLUR_STRENGTH_MIN}
            max={BLUR_STRENGTH_MAX}
          />
        )}
      </form.AppField>
      <form.AppField name="shadowEffects">
        {(field): ReactElement => (
          <EffectSwitchRow
            id={shadowId}
            label="Prose shadow"
            description="A subtle readability halo on message text."
            checked={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
          />
        )}
      </form.AppField>
      <form.AppField name="enableThemeColorization">
        {(field): ReactElement => (
          <EffectSwitchRow
            id={tintId}
            label="Tint the UI with the accent color"
            description="Retints borders and hairlines across panels, dialogs, and the composer from your accent color."
            checked={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
          />
        )}
      </form.AppField>
    </Section>
  );
}
