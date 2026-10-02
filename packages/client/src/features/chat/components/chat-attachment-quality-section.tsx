import type { AttachmentQuality } from "@orb/contracts/inference";
import { DEFAULT_ATTACHMENT_QUALITY } from "@orb/contracts/inference";
import { FieldLayout } from "@orb/ui/field";
import { Grid, Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms/editor";
import { configAnchorId } from "#state";
import { ATTACHMENT_QUALITY_LABELS, ATTACHMENT_QUALITY_SUBCATEGORY, IMAGE_DETAIL_ITEMS, VIDEO_RESOLUTION_ITEMS } from "../lib/chat-attachment-quality-model.ts";

interface QualityUpdate {
  readonly section: "chat";
  readonly patch: { readonly attachmentQuality: AttachmentQuality };
}
const useUpdateQuality = createEntityMutation<QualityUpdate, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save your attachment quality.",
});
const QualityForm = createAutosaveEntityForm<AttachmentQuality>({ defaultValues: DEFAULT_ATTACHMENT_QUALITY });
const ENTITY_ID = "chat-attachment-quality";

/** The host's outbound attachment preferences; originals remain untouched. */
export function ChatAttachmentQualitySection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your attachment quality…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your attachment quality" onRetry={retry} />}
    >
      <QualityFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function QualityFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateQuality({ trpc, invalidation });
  const save = (attachmentQuality: AttachmentQuality): Promise<unknown> => update.mutateAsync({ section: "chat", patch: { attachmentQuality } });
  return (
    <QualityForm entityId={ENTITY_ID} serverValues={data.config.chat.attachmentQuality} save={save}>
      {(session): ReactElement => <QualityFields sectionId={sectionId} session={session} />}
    </QualityForm>
  );
}

function QualityFields({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<AttachmentQuality> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section heading={ATTACHMENT_QUALITY_SUBCATEGORY.label} divider={true} id={configAnchorId("chat-behavior", ATTACHMENT_QUALITY_SUBCATEGORY.id)}>
      <ConfigTeachScope value={{ group: "chat-behavior", sub: ATTACHMENT_QUALITY_SUBCATEGORY }}>
        <SettingRowGroup>
          <SettingRow settingId="attachment-quality" span={true}>
            <FieldLayout align="track" orientation="horizontal">
              <Grid cols="settingTrack" className="gap-x-block gap-y-field">
                <Grid className="col-span-full grid-cols-subgrid gap-x-block min-w-0">
                  <form.AppField name="imageDetail">
                    {(field): ReactElement => <field.SelectField label={ATTACHMENT_QUALITY_LABELS.imageDetail} items={IMAGE_DETAIL_ITEMS} />}
                  </form.AppField>
                </Grid>
                <Grid className="col-span-full grid-cols-subgrid gap-x-block min-w-0">
                  <form.AppField name="videoMaxResolution">
                    {(field): ReactElement => <field.SelectField label={ATTACHMENT_QUALITY_LABELS.videoMaxResolution} items={VIDEO_RESOLUTION_ITEMS} />}
                  </form.AppField>
                </Grid>
              </Grid>
            </FieldLayout>
          </SettingRow>
        </SettingRowGroup>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}
