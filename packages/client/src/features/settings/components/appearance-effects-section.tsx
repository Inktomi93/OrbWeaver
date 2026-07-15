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
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import type { AppFormInstance } from "#forms";
import { BLUR_STRENGTH_MAX, BLUR_STRENGTH_MIN } from "../lib/appearance-bounds";
import { APPEARANCE_SUBCATEGORY_IDS } from "../lib/appearance-nav";
import { BLUR_SURFACE_ITEMS, SURFACE_TEXTURE_ITEMS } from "../lib/appearance-select-items";
import { settingsAnchorId } from "../lib/settings-nav-model";
import { SettingSwitchRow } from "./setting-switch-row";

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
                  <SettingSwitchRow
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
          <SettingSwitchRow
            id={shadowId}
            label="Prose shadow"
            description="A subtle readability halo on message text."
            checked={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
          />
        )}
      </form.AppField>
      <form.AppField name="surfaceTexture">
        {(field): ReactElement => (
          <field.SelectField
            label="Surface texture"
            description="A subtle film-grain overlay on panels and cards that breaks up flat-color banding. Off by default; never on message text."
            items={SURFACE_TEXTURE_ITEMS}
          />
        )}
      </form.AppField>
      <form.AppField name="enableThemeColorization">
        {(field): ReactElement => (
          <SettingSwitchRow
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
