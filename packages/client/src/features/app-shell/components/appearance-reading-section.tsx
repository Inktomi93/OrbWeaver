// The "Reading typography" appearance SECTION (SET-SEAMS stage 1) — message line-height / letter-spacing /
// paragraph-spacing / name+body scale + the justify toggle. Sizing/spacing only, never blur.
//
// It used to be a fragment TAKING the pane's one welded autosave form as a prop; under SET-SEAMS it owns its
// own read, its own key-minimal write and its own form session, and it is a settings-SECTION CONTRIBUTION at
// the `appearance` anchor owned by features/app-shell — the feature that READS these knobs
// (`surfaces/app-shell.tsx` folds them into the shell's reading scope tokens).
//
// S1 — PATCH MINIMALITY: `OWNS` is spelled once and drives the projection, the seeded defaults, the form
// type and the contribution's `owns` claim.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { pickKeys } from "@orb/kit/objects";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms/editor";
import { configAnchorId } from "#state";
import { APPEARANCE_READING_KEYS, APPEARANCE_READING_SUBCATEGORY } from "../lib/appearance-reading-model.ts";

const READING_LINE_HEIGHT_MIN = 1.2;
const READING_LINE_HEIGHT_MAX = 2.2;
const READING_LINE_HEIGHT_STEP = 0.05;
const READING_LETTER_SPACING_MIN = -0.02;
const READING_LETTER_SPACING_MAX = 0.08;
const READING_LETTER_SPACING_STEP = 0.005;
const READING_PARAGRAPH_SPACING_MIN = 0;
const READING_PARAGRAPH_SPACING_MAX = 3;
const READING_PARAGRAPH_SPACING_STEP = 0.05;
const READING_SCALE_MIN = 0.8;
const READING_SCALE_MAX = 1.6;
const READING_SCALE_STEP = 0.05;

type ReadingForm = Pick<AppearanceSettings, (typeof APPEARANCE_READING_KEYS)[number]>;

interface UpdateReadingVars {
  readonly section: "appearance";
  readonly patch: ReadingForm;
}
const useUpdateReading = createEntityMutation<UpdateReadingVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your reading settings.",
});

const ReadingAutosaveForm = createAutosaveEntityForm<ReadingForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_READING_KEYS),
});

const READING_ENTITY_ID = "appearance-reading";

/** The Reading-typography section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceReadingSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your reading settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your reading settings" onRetry={retry} />}
    >
      <ReadingFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function ReadingFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateReading({ trpc, invalidation });

  const save = (values: ReadingForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <ReadingAutosaveForm entityId={READING_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_READING_KEYS)} save={save}>
      {(session): ReactElement => <ReadingBody sectionId={sectionId} session={session} />}
    </ReadingAutosaveForm>
  );
}

function ReadingBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<ReadingForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_READING_SUBCATEGORY.label}
      id={configAnchorId("appearance", APPEARANCE_READING_SUBCATEGORY.id)}
    >
      {/* THE TEACHER LAW (#866 S3): rows are label + control — the prose lives on each leaf's `teach`. */}
      <ConfigTeachScope value={{ group: "appearance", sub: APPEARANCE_READING_SUBCATEGORY }}>
        <SettingRowGroup>
          <SettingRow settingId="line-height">
            <form.AppField name="readingLineHeight">
              {(field): ReactElement => (
                <field.SliderField label="Line height" min={READING_LINE_HEIGHT_MIN} max={READING_LINE_HEIGHT_MAX} step={READING_LINE_HEIGHT_STEP} />
              )}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="letter-spacing">
            <form.AppField name="readingLetterSpacing">
              {(field): ReactElement => (
                <field.SliderField
                  label="Letter spacing"
                  min={READING_LETTER_SPACING_MIN}
                  max={READING_LETTER_SPACING_MAX}
                  step={READING_LETTER_SPACING_STEP}
                />
              )}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="paragraph-spacing">
            <form.AppField name="readingParagraphSpacing">
              {(field): ReactElement => (
                <field.SliderField
                  label="Paragraph spacing"
                  min={READING_PARAGRAPH_SPACING_MIN}
                  max={READING_PARAGRAPH_SPACING_MAX}
                  step={READING_PARAGRAPH_SPACING_STEP}
                />
              )}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="name-scale">
            <form.AppField name="readingNameScale">
              {(field): ReactElement => (
                <field.SliderField label="Speaker name size" min={READING_SCALE_MIN} max={READING_SCALE_MAX} step={READING_SCALE_STEP} />
              )}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="body-scale">
            <form.AppField name="readingBodyScale">
              {(field): ReactElement => (
                <field.SliderField label="Message text size" min={READING_SCALE_MIN} max={READING_SCALE_MAX} step={READING_SCALE_STEP} />
              )}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="justify">
            <form.AppField name="justifyBodyText">{(field): ReactElement => <field.SwitchField label="Justify message text" />}</form.AppField>
          </SettingRow>
        </SettingRowGroup>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}
