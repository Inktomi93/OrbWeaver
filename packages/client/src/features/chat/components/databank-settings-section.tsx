// The Databank settings SECTION (Phase B ④) — the per-user document-retrieval tuning the chat gather reads:
// how many chunks to pull (k), the cosine floor (minScore), whether to cross-encoder rerank, and the
// `{{databank}}` slot's token budget. Live-read every turn via ForeignInputs → gatherRetrieval →
// search.documents (DB6); before this section they were dormant (no client write path).
//
// A settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c / pain-point §7) at the chat-behavior
// anchor: chat OWNS the {{databank}} slot's consumption (the gather is chat's op), so it contributes the
// tuning here rather than growing features/settings (the memory-section precedent). Reads getUserSettings
// (cache-first) and autosaves through updateUserSettingsSection("databank") — a ≥3-field form, so it rides
// the autosave form factory (D54 §13.4). The `chunk` (ingest-only) params round-trip untouched through the
// section-patch deep-merge. Homed in components/ (a fragment inside the chat-behavior pane surface, which
// owns containment + focus).

import { FieldLayout } from "@orb/ui/field";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { SectionSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { DATABANK_SETTINGS_ENTITY_ID, DatabankSettingsAutosaveForm } from "../hooks/use-databank-settings-form.ts";
import type { DatabankSettingsForm } from "../lib/databank-settings-model.ts";
import {
  K_MAX,
  K_MIN,
  MIN_SCORE_MAX,
  MIN_SCORE_MIN,
  projectDatabankForm,
  SLOT_BUDGET_MAX,
  SLOT_BUDGET_MIN,
  toDatabankSectionPatch,
} from "../lib/databank-settings-model.ts";
import { DATABANK_SETTINGS_SUBCATEGORY } from "../lib/databank-settings-section-nav.ts";

interface UpdateDatabankVars {
  readonly section: "databank";
  readonly patch: Record<string, unknown>;
}
const useUpdateDatabank = createEntityMutation<UpdateDatabankVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your databank settings.",
});

/** The Databank section body — mounted at the chat-behavior pane's contributed-sections anchor. */
export function DatabankSettingsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your databank settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your databank settings" onRetry={retry} />}
    >
      <DatabankSettingsFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function DatabankSettingsFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateDatabank({ trpc, invalidation });

  const save = (values: DatabankSettingsForm): Promise<unknown> => update.mutateAsync({ section: "databank", patch: toDatabankSectionPatch(values) });

  return (
    <DatabankSettingsAutosaveForm entityId={DATABANK_SETTINGS_ENTITY_ID} serverValues={projectDatabankForm(data.config.databank)} save={save}>
      {(session): ReactElement => <DatabankSettingsBody sectionId={sectionId} session={session} />}
    </DatabankSettingsAutosaveForm>
  );
}

function DatabankSettingsBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<DatabankSettingsForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section divider={true} heading={DATABANK_SETTINGS_SUBCATEGORY.label} id={configAnchorId("chat-behavior", DATABANK_SETTINGS_SUBCATEGORY.id)}>
      <FieldLayout orientation="horizontal">
        <Container>
          <Stack gap="field">
            <form.AppField name="k">
              {(field): ReactElement => (
                <field.NumberField
                  label="Documents retrieved"
                  description="How many document chunks the assistant pulls into a turn from your attached databank."
                  min={K_MIN}
                  max={K_MAX}
                />
              )}
            </form.AppField>
            <form.AppField name="minScore">
              {(field): ReactElement => (
                <field.NumberField
                  label="Match threshold"
                  description="Minimum similarity (0–1) a chunk needs to be included. Higher = fewer, more-relevant chunks."
                  min={MIN_SCORE_MIN}
                  max={MIN_SCORE_MAX}
                  step={0.05}
                />
              )}
            </form.AppField>
            <form.AppField name="rerank">
              {(field): ReactElement => (
                <field.SwitchField
                  label="Rerank results"
                  description="Run a cross-encoder pass to re-order the retrieved chunks by relevance before injecting them. Slower, more accurate."
                />
              )}
            </form.AppField>
            <form.AppField name="slotTokenBudget">
              {(field): ReactElement => (
                <field.NumberField
                  label="Databank token budget"
                  description="The most tokens of retrieved documents injected into a turn. 0 disables databank injection."
                  min={SLOT_BUDGET_MIN}
                  max={SLOT_BUDGET_MAX}
                />
              )}
            </form.AppField>
            <Row gap="field" align="center">
              <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
            </Row>
          </Stack>
        </Container>
      </FieldLayout>
    </Section>
  );
}
