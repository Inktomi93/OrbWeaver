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
import { FieldLayout } from "@orb/ui/field";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { APPEARANCE_READING_KEYS, APPEARANCE_READING_SUBCATEGORY } from "../lib/appearance-reading-model";

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
      id={settingsAnchorId("appearance", APPEARANCE_READING_SUBCATEGORY.id)}
    >
      <FieldLayout orientation="horizontal">
        <form.AppField name="readingLineHeight">
          {(field): ReactElement => (
            <field.SliderField
              label="Line height"
              description="Spacing between lines of message text."
              min={READING_LINE_HEIGHT_MIN}
              max={READING_LINE_HEIGHT_MAX}
              step={READING_LINE_HEIGHT_STEP}
            />
          )}
        </form.AppField>
        <form.AppField name="readingLetterSpacing">
          {(field): ReactElement => (
            <field.SliderField
              label="Letter spacing"
              description="Tracking applied to message text (em)."
              min={READING_LETTER_SPACING_MIN}
              max={READING_LETTER_SPACING_MAX}
              step={READING_LETTER_SPACING_STEP}
            />
          )}
        </form.AppField>
        <form.AppField name="readingParagraphSpacing">
          {(field): ReactElement => (
            <field.SliderField
              label="Paragraph spacing"
              description="Gap between paragraphs inside one message (rem)."
              min={READING_PARAGRAPH_SPACING_MIN}
              max={READING_PARAGRAPH_SPACING_MAX}
              step={READING_PARAGRAPH_SPACING_STEP}
            />
          )}
        </form.AppField>
        <form.AppField name="readingNameScale">
          {(field): ReactElement => (
            <field.SliderField
              label="Speaker name size"
              description="A multiplier on the attribution name text."
              min={READING_SCALE_MIN}
              max={READING_SCALE_MAX}
              step={READING_SCALE_STEP}
            />
          )}
        </form.AppField>
        <form.AppField name="readingBodyScale">
          {(field): ReactElement => (
            <field.SliderField
              label="Message text size"
              description="A multiplier on message body text, independent of the global text size above."
              min={READING_SCALE_MIN}
              max={READING_SCALE_MAX}
              step={READING_SCALE_STEP}
            />
          )}
        </form.AppField>
        <form.AppField name="justifyBodyText">
          {(field): ReactElement => (
            <field.SwitchField label="Justify message text" description="Align both edges of wrapped message text (manuscript style)." />
          )}
        </form.AppField>
      </FieldLayout>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Row>
    </Section>
  );
}
