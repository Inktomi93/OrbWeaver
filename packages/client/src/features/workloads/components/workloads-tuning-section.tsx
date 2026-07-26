// The Workloads analysis-tuning SECTION (Phase B ⑤) — the discovery-pass knobs the workloads runners read:
// dupThreshold (character dedup cosine floor), computeThemesK (theme cluster count), maxPairs + hubFraction
// (the cooccurrence pass). Phase A wired the server READ (`settings.workloads.X ?? floor` in
// compute-themes/find-duplicates/compute-cooccurrence runners); this section is the client WRITE path —
// before it, the knobs were unsettable (the pane existed, the knobs unbound).
//
// A settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c / pain-point §7) at the `workloads`
// anchor, owned by features/workloads (its own pane — the stint-2 truer-owner test). Reads getUserSettings
// (cache-first) and autosaves through updateUserSettingsSection("workloads") — a ≥3-field form, so it rides
// the autosave form factory (D54 §13.4). Homed in components/ (a fragment inside the workloads pane surface,
// which owns containment + focus).

import { FieldLayout } from "@orb/ui/field";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { AutosaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { WORKLOADS_TUNING_ENTITY_ID, WorkloadsTuningAutosaveForm } from "../hooks/use-workloads-tuning-form";
import type { WorkloadsTuningForm } from "../lib/workloads-tuning-model";
import {
  COMPUTE_THEMES_K_MAX,
  COMPUTE_THEMES_K_MIN,
  DUP_THRESHOLD_MAX,
  DUP_THRESHOLD_MIN,
  HUB_FRACTION_MAX,
  HUB_FRACTION_MIN,
  MAX_PAIRS_MAX,
  MAX_PAIRS_MIN,
  projectWorkloadsTuningForm,
  toWorkloadsSectionPatch,
} from "../lib/workloads-tuning-model";
import { WORKLOADS_TUNING_SUBCATEGORY } from "../lib/workloads-tuning-nav";

interface UpdateWorkloadsVars {
  readonly section: "workloads";
  readonly patch: Record<string, unknown>;
}
const useUpdateWorkloadsTuning = createEntityMutation<UpdateWorkloadsVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your analysis-tuning settings.",
});

/** The Workloads analysis-tuning section body — mounted at the workloads pane's contributed-sections anchor. */
export function WorkloadsTuningSection(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading your analysis-tuning settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your analysis-tuning settings" onRetry={retry} />}
    >
      <WorkloadsTuningFormBody />
    </QueryBoundary>
  );
}

function WorkloadsTuningFormBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateWorkloadsTuning({ trpc, invalidation });

  const save = (values: WorkloadsTuningForm): Promise<unknown> => update.mutateAsync({ section: "workloads", patch: toWorkloadsSectionPatch(values) });

  return (
    <WorkloadsTuningAutosaveForm entityId={WORKLOADS_TUNING_ENTITY_ID} serverValues={projectWorkloadsTuningForm(data.config.workloads)} save={save}>
      {(session): ReactElement => <WorkloadsTuningBody session={session} />}
    </WorkloadsTuningAutosaveForm>
  );
}

function WorkloadsTuningBody({ session }: { readonly session: AutosaveSession<WorkloadsTuningForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section divider={true} heading={WORKLOADS_TUNING_SUBCATEGORY.label} id={settingsAnchorId("workloads", WORKLOADS_TUNING_SUBCATEGORY.id)}>
      <FieldLayout orientation="horizontal">
        <Container>
          <Stack gap="field">
            <form.AppField name="dupThreshold">
              {(field): ReactElement => (
                <field.NumberField
                  label="Duplicate threshold"
                  description="Cosine similarity (0–1) above which two characters are flagged as duplicates. Higher = only near-identical pairs."
                  min={DUP_THRESHOLD_MIN}
                  max={DUP_THRESHOLD_MAX}
                  step={0.01}
                />
              )}
            </form.AppField>
            <form.AppField name="computeThemesK">
              {(field): ReactElement => (
                <field.NumberField
                  label="Theme clusters"
                  description="How many theme clusters the k-means pass groups your library into."
                  min={COMPUTE_THEMES_K_MIN}
                  max={COMPUTE_THEMES_K_MAX}
                />
              )}
            </form.AppField>
            <form.AppField name="maxPairs">
              {(field): ReactElement => (
                <field.NumberField
                  label="Max keyword pairs"
                  description="The most keyword co-occurrence pairs the analysis retains per library. Higher = finer detail, more storage."
                  min={MAX_PAIRS_MIN}
                  max={MAX_PAIRS_MAX}
                  step={500}
                />
              )}
            </form.AppField>
            <form.AppField name="hubFraction">
              {(field): ReactElement => (
                <field.NumberField
                  label="Hub-token cutoff"
                  description="Fraction (0–1) of the most-common keywords dropped as uninformative hubs before co-occurrence. Higher drops more."
                  min={HUB_FRACTION_MIN}
                  max={HUB_FRACTION_MAX}
                  step={0.05}
                />
              )}
            </form.AppField>
            <Row gap="field" align="center">
              <AutosaveStatus state={saveState} onRetry={retrySave} caption="Synced across your devices." />
            </Row>
          </Stack>
        </Container>
      </FieldLayout>
    </Section>
  );
}
