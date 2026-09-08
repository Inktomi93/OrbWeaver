// The "Effects" appearance SECTION — the frosted-glass surface switches + glass blur radius, prose shadow,
// surface texture and the accent tint. Redesigned to the settings-row grammar (owner ruling: the old
// ToggleGroup multi-select + a dangling "Enable" button read ugly). By value type (§13.8 R4): the
// frosted-glass surfaces are INDEPENDENT on/off effects, so each is its own label-left / switch-right
// `SettingSwitchRow` (a toggle-group would imply exclusivity/segmentation, which is wrong here) —
// every switch toggles membership in the one `blurSurfaces` array field, so the autosave binding law is
// intact (all state still flows through `form.AppField`). `blurStrength` stays a slider (a continuous
// value); Prose shadow + accent tint join the same clean switch-row list.
//
// SET-SEAMS stage 1: it used to be a fragment TAKING the pane's one welded autosave form as a prop; it owns
// its own read, its own key-minimal write and its own form session now, as a settings-SECTION CONTRIBUTION
// at the `appearance` anchor owned by features/app-shell — the feature that READS these knobs
// (`surfaces/app-shell.tsx`). S1: `OWNS` is spelled once and drives the projection, the seeded defaults, the
// form type and the contribution's `owns` claim.

import type { AppearanceSettings, BlurSurface } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { pickKeys } from "@orb/kit/objects";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup, SettingSwitchRow } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms/editor";
import { configAnchorId } from "#state";
import { BLUR_STRENGTH_MAX, BLUR_STRENGTH_MIN } from "../lib/appearance-bounds.ts";
import { APPEARANCE_EFFECTS_KEYS, APPEARANCE_EFFECTS_SUBCATEGORY } from "../lib/appearance-effects-model.ts";
import { BLUR_SURFACE_ITEMS, SURFACE_TEXTURE_ITEMS } from "../lib/appearance-select-items.ts";

type EffectsForm = Pick<AppearanceSettings, (typeof APPEARANCE_EFFECTS_KEYS)[number]>;

interface UpdateEffectsVars {
  readonly section: "appearance";
  readonly patch: EffectsForm;
}
const useUpdateEffects = createEntityMutation<UpdateEffectsVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your effect settings.",
});

const EffectsAutosaveForm = createAutosaveEntityForm<EffectsForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_EFFECTS_KEYS),
});

const EFFECTS_ENTITY_ID = "appearance-effects";

/** The Effects section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceEffectsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your effect settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your effect settings" onRetry={retry} />}
    >
      <EffectsFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function EffectsFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateEffects({ trpc, invalidation });

  const save = (values: EffectsForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <EffectsAutosaveForm entityId={EFFECTS_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_EFFECTS_KEYS)} save={save}>
      {(session): ReactElement => <EffectsBody sectionId={sectionId} session={session} />}
    </EffectsAutosaveForm>
  );
}

function EffectsBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<EffectsForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_EFFECTS_SUBCATEGORY.label}
      id={configAnchorId("appearance", APPEARANCE_EFFECTS_SUBCATEGORY.id)}
    >
      {/* THE TEACHER LAW (#866 S3): rows are label + control — the prose lives on each leaf's `teach`. */}
      <ConfigTeachScope value={{ group: "appearance", sub: APPEARANCE_EFFECTS_SUBCATEGORY }}>
        <SettingRowGroup>
          {/* `span` (#932): the four surface switches are a SET under one leaf, not a two-column knob row,
              so the row draws the registry lead (name · `i` · full-width gloss) and the switches sit below
              it. The hand-rolled `<Text voice="label">Frosted glass</Text>` is gone — it duplicated the
              leaf's own name and carried neither the `i` nor the gloss. */}
          <SettingRow settingId="frosted-glass" span={true}>
            <Stack gap="field">
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
                          label={item.label}
                          checked={field.state.value.includes(surface)}
                          onBlur={field.handleBlur}
                          onChange={(next): void =>
                            field.handleChange(next ? [...field.state.value, surface] : field.state.value.filter((value) => value !== surface))
                          }
                        />
                      );
                    })}
                  </Stack>
                )}
              </form.AppField>
            </Stack>
          </SettingRow>
          <SettingRow settingId="glass-blur">
            <form.AppField name="blurStrength">
              {(field): ReactElement => <field.SliderField label="Glass blur radius" min={BLUR_STRENGTH_MIN} max={BLUR_STRENGTH_MAX} />}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="prose-shadow">
            <form.AppField name="shadowEffects">
              {(field): ReactElement => (
                <SettingSwitchRow label="Prose shadow" checked={field.state.value} onBlur={field.handleBlur} onChange={field.handleChange} />
              )}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="surface-texture">
            <form.AppField name="surfaceTexture">
              {(field): ReactElement => <field.SelectField label="Surface texture" items={SURFACE_TEXTURE_ITEMS} />}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="accent-tint">
            <form.AppField name="enableThemeColorization">
              {(field): ReactElement => (
                <SettingSwitchRow
                  label="Tint the UI with the accent color"
                  checked={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
              )}
            </form.AppField>
          </SettingRow>
        </SettingRowGroup>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}
