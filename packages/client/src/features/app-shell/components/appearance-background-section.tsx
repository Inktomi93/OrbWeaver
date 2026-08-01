// The Background appearance SECTION (SET-SEAMS stage 1) — the background image kind + its library, fit,
// scrim and blur. A settings-SECTION CONTRIBUTION at the `appearance` anchor owned by features/app-shell:
// app-shell PAINTS the background (`surfaces/app-shell.tsx` mounts the image/video layers off
// `#lib`'s `resolveThemeBackground`), so under §6 it owns the editor too.
//
// S1 — PATCH MINIMALITY: `OWNS` is spelled once and drives the projection, the seeded defaults, the form
// type and the contribution's `owns` claim. The nine background keys are ONE section deliberately — a
// newly-added background writes `backgroundLibrary` + the three `backgroundAsset*` selection fields in ONE
// patch (BG-D), so splitting them across sections would split an atomic write.

import type { AppearanceSettings, BackgroundLibraryEntry } from "@orb/contracts/settings";
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
import { settingsAnchorId } from "#state";
import { APPEARANCE_BACKGROUND_KEYS, APPEARANCE_BACKGROUND_SUBCATEGORY } from "../lib/appearance-background-model";
import { BACKGROUND_BLUR_MAX, BACKGROUND_BLUR_MIN, BACKGROUND_DIM_MAX, BACKGROUND_DIM_MIN, BACKGROUND_DIM_STEP } from "../lib/appearance-bounds";
import { BACKGROUND_FIT_ITEMS, BACKGROUND_KIND_ITEMS, SEEDED_BACKGROUND_ITEMS } from "../lib/appearance-select-items";
import { BackgroundUploadField } from "./background-upload-field";
import { ExternalBackgroundField } from "./external-background-field";

type BackgroundForm = Pick<AppearanceSettings, (typeof APPEARANCE_BACKGROUND_KEYS)[number]>;

interface UpdateBackgroundVars {
  readonly section: "appearance";
  readonly patch: BackgroundForm;
}
const useUpdateBackground = createEntityMutation<UpdateBackgroundVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your background settings.",
});

const BackgroundAutosaveForm = createAutosaveEntityForm<BackgroundForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_BACKGROUND_KEYS),
});

const BACKGROUND_ENTITY_ID = "appearance-background";

/** The Background section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceBackgroundSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your background settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your background settings" onRetry={retry} />}
    >
      <BackgroundFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function BackgroundFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateBackground({ trpc, invalidation });

  const save = (values: BackgroundForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <BackgroundAutosaveForm entityId={BACKGROUND_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_BACKGROUND_KEYS)} save={save}>
      {(session): ReactElement => <BackgroundBody sectionId={sectionId} session={session} />}
    </BackgroundAutosaveForm>
  );
}

function BackgroundBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<BackgroundForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  // A newly-added background — uploaded or materialized from a URL — SAVES to the library (BG-D) and becomes
  // the live one in the same autosave patch. Byte-identical adds legitimately produce two rows: `assetId` is
  // content-addressed and shared, `entryId` is the per-row identity (F-P2), so no de-duplication here.
  const addBackground = (entry: BackgroundLibraryEntry): void => {
    form.setFieldValue("backgroundLibrary", [...form.state.values.backgroundLibrary, entry]);
    form.setFieldValue("backgroundAssetId", entry.assetId);
    form.setFieldValue("backgroundAssetHash", entry.assetHash);
    form.setFieldValue("backgroundAssetMime", entry.mime);
  };
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_BACKGROUND_SUBCATEGORY.label}
      id={settingsAnchorId("appearance", APPEARANCE_BACKGROUND_SUBCATEGORY.id)}
    >
      <FieldLayout orientation="horizontal">
        <form.AppField name="backgroundImageKind">
          {(field): ReactElement => (
            <field.SelectField
              label="Image"
              description="A decorative photo behind the app, with a scrim so text stays readable. Pairs with Frosted glass below."
              items={BACKGROUND_KIND_ITEMS}
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state): string => state.values.backgroundImageKind}>
          {(kind): ReactElement | null => {
            if (kind === "none") {
              return null;
            }
            return (
              <>
                {kind === "seeded" && (
                  <form.AppField name="backgroundSeededId">
                    {(field): ReactElement => <field.SelectField label="Seeded image" placeholder="Choose a background" items={SEEDED_BACKGROUND_ITEMS} />}
                  </form.AppField>
                )}

                {kind === "asset" && (
                  <>
                    {/* Two ways INTO the one library (BG-D), one landing: an own upload and a pasted URL
                        (which the server materializes into an owned CAS asset — never an external URL is
                        persisted, BG-C). Both hand up a ready entry and take the SAME append + select
                        path, so `/setbackground <name>` and the carried-background picker (which points
                        users here to add one) see every background either way. */}
                    <form.Subscribe selector={(state): string => state.values.backgroundAssetHash}>
                      {(hash): ReactElement => <BackgroundUploadField currentHash={hash} onUploaded={addBackground} />}
                    </form.Subscribe>
                    <ExternalBackgroundField onAdded={addBackground} />
                  </>
                )}
                <form.AppField name="backgroundFit">{(field): ReactElement => <field.SelectField label="Fit" items={BACKGROUND_FIT_ITEMS} />}</form.AppField>
                <form.AppField name="backgroundDim">
                  {(field): ReactElement => (
                    <field.SliderField
                      label="Scrim opacity"
                      description="Darkens the image so text stays legible — never fully off."
                      min={BACKGROUND_DIM_MIN}
                      max={BACKGROUND_DIM_MAX}
                      step={BACKGROUND_DIM_STEP}
                    />
                  )}
                </form.AppField>
                <form.AppField name="backgroundBlur">
                  {(field): ReactElement => (
                    <field.SliderField
                      label="Image blur"
                      description="Softens the photo itself (the darkening scrim above stays sharp)."
                      min={BACKGROUND_BLUR_MIN}
                      max={BACKGROUND_BLUR_MAX}
                    />
                  )}
                </form.AppField>
              </>
            );
          }}
        </form.Subscribe>
      </FieldLayout>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Row>
    </Section>
  );
}
