// The World-info settings SECTION (Phase B ②): scanDepth + tokenBudget — read-live via ForeignInputs on
// every turn (compose) but previously UI-less (ST surfaces both prominently). Reads the synced
// UserSettings.worldInfo blob (cache-first — the host pane already loaded it) and autosaves each change
// back through updateUserSettingsSection("worldInfo"), which refetches getUserSettings so the next turn's
// world-info scan honors the new depth/budget.
//
// A settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c / pain-point §7): world-info OWNS
// this section, contributed into the chat-behavior pane via the settings-section seam — never grown into
// features/settings. Homed in components/ (NOT surfaces/): a FRAGMENT mounted INSIDE the chat-behavior pane
// surface, which owns containment + focus (extracted-fragment precedent; client-structure +
// surface-a11y-focus do not apply).

import type { UserSettings } from "@orb/contracts/settings";
import { FieldLayout } from "@orb/ui/field";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { SectionSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { WORLD_INFO_SETTINGS_ENTITY_ID, WorldInfoSettingsAutosaveForm } from "../hooks/use-world-info-settings-form";
import { SCAN_DEPTH_MAX, SCAN_DEPTH_MIN, WI_TOKEN_BUDGET_MAX, WI_TOKEN_BUDGET_MIN } from "../lib/world-info-settings-model";
import { WORLD_INFO_SETTINGS_SUBCATEGORY } from "../lib/world-info-settings-nav";

// The form value IS the stored section shape — derived in place (no re-spelled alias; no-inline-types).
type WorldInfoSettingsForm = UserSettings["worldInfo"];

interface UpdateWorldInfoVars {
  readonly section: "worldInfo";
  readonly patch: Record<string, unknown>;
}
const useUpdateWorldInfoSettings = createEntityMutation<UpdateWorldInfoVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your world-info settings.",
});

/** The World-info settings section body — mounted at the chat-behavior pane's contributed-sections anchor. */
export function WorldInfoSettingsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your world-info settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your world-info settings" onRetry={retry} />}
    >
      <WorldInfoSettingsFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function WorldInfoSettingsFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateWorldInfoSettings({ trpc, invalidation });

  const save = (values: WorldInfoSettingsForm): Promise<unknown> =>
    update.mutateAsync({ section: "worldInfo", patch: values as unknown as Record<string, unknown> });

  return (
    <WorldInfoSettingsAutosaveForm entityId={WORLD_INFO_SETTINGS_ENTITY_ID} serverValues={data.config.worldInfo} save={save}>
      {(session): ReactElement => <WorldInfoSettingsBody sectionId={sectionId} session={session} />}
    </WorldInfoSettingsAutosaveForm>
  );
}

function WorldInfoSettingsBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<WorldInfoSettingsForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section divider={true} heading={WORLD_INFO_SETTINGS_SUBCATEGORY.label} id={settingsAnchorId("chat-behavior", WORLD_INFO_SETTINGS_SUBCATEGORY.id)}>
      <FieldLayout orientation="horizontal">
        <Container>
          <Stack gap="field">
            <form.AppField name="scanDepth">
              {(field): ReactElement => (
                <field.NumberField
                  label="Scan depth"
                  description="How many recent messages world-info keywords are matched against. Higher catches older mentions; lower keeps the scan tight."
                  min={SCAN_DEPTH_MIN}
                  max={SCAN_DEPTH_MAX}
                />
              )}
            </form.AppField>
            <form.AppField name="tokenBudget">
              {(field): ReactElement => (
                <field.NumberField
                  label="Token budget"
                  description="The most tokens of matched world-info entries injected into a turn. Entries past the budget are dropped by priority. 0 disables world-info injection."
                  min={WI_TOKEN_BUDGET_MIN}
                  max={WI_TOKEN_BUDGET_MAX}
                />
              )}
            </form.AppField>
            <Row gap="field" align="center">
              <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} caption="Synced across your devices." />
            </Row>
          </Stack>
        </Container>
      </FieldLayout>
    </Section>
  );
}
