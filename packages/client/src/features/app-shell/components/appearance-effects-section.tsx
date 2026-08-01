// The "Effects" appearance SECTION — the frosted-glass surface switches + glass blur radius, prose shadow,
// surface texture and the accent tint. Redesigned to the settings-row grammar (owner ruling: the old
// ToggleGroup multi-select + a dangling "Enable" button read ugly). By value type (§13.8 R4): the
// frosted-glass surfaces are INDEPENDENT on/off effects, so each is its own label-left / switch-right
// `@orb/ui/setting-row` row (a toggle-group would imply exclusivity/segmentation, which is wrong here) —
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
import { FieldLayout } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { SettingSwitchRow } from "#components";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { BLUR_STRENGTH_MAX, BLUR_STRENGTH_MIN } from "../lib/appearance-bounds";
import { APPEARANCE_EFFECTS_KEYS, APPEARANCE_EFFECTS_SUBCATEGORY } from "../lib/appearance-effects-model";
import { BLUR_SURFACE_ITEMS, SURFACE_TEXTURE_ITEMS } from "../lib/appearance-select-items";

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
  const glassId = useId();
  const shadowId = useId();
  const tintId = useId();
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_EFFECTS_SUBCATEGORY.label}
      id={settingsAnchorId("appearance", APPEARANCE_EFFECTS_SUBCATEGORY.id)}
    >
      <FieldLayout orientation="horizontal">
        <Stack gap="field">
          <Text voice="label">Frosted glass</Text>
          <Text voice="gloss">
            Backdrop blur + a translucent fill on the surfaces you pick. Messages carry glass poorly (scrolling prose over blur), so they stay off unless you
            opt in.
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
                        field.handleChange(next ? [...field.state.value, surface] : field.state.value.filter((value) => value !== surface))
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
      </FieldLayout>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Row>
    </Section>
  );
}
