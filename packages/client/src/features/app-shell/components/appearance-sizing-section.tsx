// The "Sizing & motion" appearance SECTION (SET-SEAMS stage 1) — chatWidthPct / fontScale / density /
// elevation / reducedMotion. A settings-SECTION CONTRIBUTION at the `appearance` anchor owned by
// features/app-shell, the feature that READS all five (`surfaces/app-shell.tsx`: the shell scope tokens, the
// `--width-shell-content` clamp, `data-elevation`, `data-reduced-motion`). §6's rule is reader-owns, and
// app-shell is already a definition owner (chrome + the You modal), so this is not a new privilege.
//
// S1 — PATCH MINIMALITY: `OWNS` is spelled once and drives the projection, the seeded defaults, the form
// type and the contribution's `owns` claim, so this section's debounced save can never carry a sibling
// appearance section's key (SET-SEAMS §2). Homed in components/ — a FRAGMENT inside the appearance pane,
// which owns containment + focus.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { pickKeys } from "@orb/kit/objects";
import { FieldLayout } from "@orb/ui/field";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { DENSITY_ITEMS } from "#lib";
import { settingsAnchorId } from "#state";
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from "../lib/appearance-bounds";
import { ELEVATION_ITEMS } from "../lib/appearance-select-items";
import { APPEARANCE_SIZING_KEYS, APPEARANCE_SIZING_SUBCATEGORY } from "../lib/appearance-sizing-model";

type SizingForm = Pick<AppearanceSettings, (typeof APPEARANCE_SIZING_KEYS)[number]>;

interface UpdateSizingVars {
  readonly section: "appearance";
  readonly patch: SizingForm;
}
const useUpdateSizing = createEntityMutation<UpdateSizingVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your sizing settings.",
});

const SizingAutosaveForm = createAutosaveEntityForm<SizingForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_SIZING_KEYS),
});

const SIZING_ENTITY_ID = "appearance-sizing";

/** The Sizing & motion section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceSizingSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your sizing settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your sizing settings" onRetry={retry} />}
    >
      <SizingFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function SizingFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateSizing({ trpc, invalidation });

  const save = (values: SizingForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <SizingAutosaveForm entityId={SIZING_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_SIZING_KEYS)} save={save}>
      {(session): ReactElement => <SizingBody sectionId={sectionId} session={session} />}
    </SizingAutosaveForm>
  );
}

function SizingBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<SizingForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_SIZING_SUBCATEGORY.label}
      id={settingsAnchorId("appearance", APPEARANCE_SIZING_SUBCATEGORY.id)}
    >
      <FieldLayout orientation="horizontal">
        <form.AppField name="chatWidthPct">
          {(field): ReactElement => (
            <field.SliderField
              label="Chat width (%)"
              description="How wide the reading column may grow on large screens."
              min={CHAT_WIDTH_MIN}
              max={CHAT_WIDTH_MAX}
            />
          )}
        </form.AppField>
        <form.AppField name="fontScale">
          {(field): ReactElement => (
            <field.SliderField
              label="Text size"
              description="A global multiplier for all text (1 = default)."
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={FONT_SCALE_STEP}
            />
          )}
        </form.AppField>
        <form.AppField name="density">
          {(field): ReactElement => <field.SelectField label="Density" description="Compact tightens spacing throughout the app." items={DENSITY_ITEMS} />}
        </form.AppField>
        <form.AppField name="elevation">
          {(field): ReactElement => (
            <field.SelectField
              label="Surface elevation"
              description="Layered lifts the panels and content into a brightness ladder and drops the region borders; flat keeps one tone."
              items={ELEVATION_ITEMS}
            />
          )}
        </form.AppField>
        <form.AppField name="reducedMotion">
          {(field): ReactElement => (
            <field.SwitchField label="Reduce motion" description="Freeze animations and transitions, beyond your system's own reduced-motion setting." />
          )}
        </form.AppField>
      </FieldLayout>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Row>
    </Section>
  );
}
