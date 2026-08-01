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
import { FieldLayout } from "@orb/ui/field";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { APPEARANCE_MESSAGE_DETAILS_KEYS, APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY } from "../lib/appearance-message-details-model";
import { MESSAGE_ACTIONS_ITEMS } from "../lib/appearance-select-items";

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
      id={settingsAnchorId("appearance", APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY.id)}
    >
      <FieldLayout orientation="horizontal">
        <form.AppField name="showTimestamps">
          {(field): ReactElement => <field.SwitchField label="Show timestamps" description="A time chip on every message." />}
        </form.AppField>
        <form.AppField name="showMessageId">
          {(field): ReactElement => <field.SwitchField label="Show message ID" description="The message's stable id, for scripting/reference." />}
        </form.AppField>
        <form.AppField name="showModelIcon">
          {(field): ReactElement => <field.SwitchField label="Show model" description="Which model generated the message, when known." />}
        </form.AppField>
        <form.AppField name="showTokenCount">
          {(field): ReactElement => <field.SwitchField label="Show token count" description="The message's token usage, when known." />}
        </form.AppField>
        <form.AppField name="showGenerationTimer">
          {(field): ReactElement => (
            <field.SwitchField label="Show generation time" description="How long the model took to generate the message, when known." />
          )}
        </form.AppField>
        <form.AppField name="showGenerationCost">
          {(field): ReactElement => (
            <field.SwitchField label="Show generation cost" description="A click-to-reveal per-message cost, settled on demand against OpenRouter." />
          )}
        </form.AppField>
        <form.AppField name="showLLMReasoningIcon">
          {(field): ReactElement => (
            <field.SwitchField label="Show reasoning icon" description="A small glyph on the reasoning disclosure, alongside its Thinking/Thought label." />
          )}
        </form.AppField>
        <form.AppField name="messageActions">
          {(field): ReactElement => (
            <field.SelectField
              label="Action cluster"
              description="Edit/hide/fork/delete/copy, shown on hover (default) or always."
              items={MESSAGE_ACTIONS_ITEMS}
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
