// The "Message details & actions" appearance SECTION (SET-SEAMS stage 1) — the per-message chips
// (timestamp / id / model / tokens / gen time / gen cost / reasoning icon) plus the action-cluster mode.
// A settings-SECTION CONTRIBUTION at the `appearance` anchor owned by features/chat, the feature that READS
// every one of these knobs (`hooks/use-message-appearance.ts`).
//
// S1 — PATCH MINIMALITY: `OWNS` is spelled once and drives the projection, the seeded defaults, the form
// type and the contribution's `owns` claim. Homed in components/ — a FRAGMENT inside the appearance pane,
// which owns containment + focus.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { pickKeys } from "@orb/kit/objects";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { APPEARANCE_MESSAGE_DETAILS_KEYS, APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY } from "../lib/appearance-message-details-model.ts";
import { MESSAGE_ACTIONS_ITEMS } from "../lib/appearance-select-items.ts";

type MessageDetailsForm = Pick<AppearanceSettings, (typeof APPEARANCE_MESSAGE_DETAILS_KEYS)[number]>;

interface UpdateMessageDetailsVars {
  readonly section: "appearance";
  readonly patch: MessageDetailsForm;
}
const useUpdateMessageDetails = createEntityMutation<UpdateMessageDetailsVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your message-detail settings.",
});

const MessageDetailsAutosaveForm = createAutosaveEntityForm<MessageDetailsForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_MESSAGE_DETAILS_KEYS),
});

const MESSAGE_DETAILS_ENTITY_ID = "appearance-message-details";

/** The Message-details section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceMessageDetailsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your message-detail settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your message-detail settings" onRetry={retry} />}
    >
      <MessageDetailsFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function MessageDetailsFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateMessageDetails({ trpc, invalidation });

  const save = (values: MessageDetailsForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <MessageDetailsAutosaveForm
      entityId={MESSAGE_DETAILS_ENTITY_ID}
      serverValues={pickKeys(data.config.appearance, APPEARANCE_MESSAGE_DETAILS_KEYS)}
      save={save}
    >
      {(session): ReactElement => <MessageDetailsBody sectionId={sectionId} session={session} />}
    </MessageDetailsAutosaveForm>
  );
}

function MessageDetailsBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<MessageDetailsForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY.label}
      id={configAnchorId("appearance", APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY.id)}
    >
      {/* THE TEACHER LAW (#866 S3): rows are label + control — the prose lives on each leaf's `teach`
          (incl. the #167 "where to look" line for Show model). */}
      <ConfigTeachScope value={{ group: "appearance", sub: APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY }}>
        <SettingRowGroup>
          <SettingRow settingId="show-timestamps">
            <form.AppField name="showTimestamps">{(field): ReactElement => <field.SwitchField label="Show timestamps" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="show-message-id">
            <form.AppField name="showMessageId">{(field): ReactElement => <field.SwitchField label="Show message ID" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="show-model">
            <form.AppField name="showModelIcon">{(field): ReactElement => <field.SwitchField label="Show model" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="show-token-count">
            <form.AppField name="showTokenCount">{(field): ReactElement => <field.SwitchField label="Show token count" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="show-generation-time">
            <form.AppField name="showGenerationTimer">{(field): ReactElement => <field.SwitchField label="Show generation time" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="show-generation-cost">
            <form.AppField name="showGenerationCost">{(field): ReactElement => <field.SwitchField label="Show generation cost" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="show-reasoning">
            <form.AppField name="showLLMReasoningIcon">{(field): ReactElement => <field.SwitchField label="Show reasoning icon" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="message-actions">
            <form.AppField name="messageActions">
              {(field): ReactElement => <field.SelectField label="Action cluster" items={MESSAGE_ACTIONS_ITEMS} />}
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
