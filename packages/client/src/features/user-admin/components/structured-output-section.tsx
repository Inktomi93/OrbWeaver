// The Structured-output admin SECTION (D126) — the deployment's answer to "how do we spell an OPTIONAL field
// when a request must come back as schema-shaped JSON". The engine + both shapes were built 2026-08-03
// (`@orb/kit/json-schema` `scrubWireSchema`); until this section they were selectable only by editing a source
// constant and redeploying, which is a dead switch (D107) — the capability existed and nobody could reach it.
//
// A settings-SECTION CONTRIBUTION (SET-SEAMS §6c) at the `admin` anchor, owned by user-admin (it owns every
// AppSettings-tier section; the knob has no client reader to home with — it is consumed server-side by the
// extraction request builder, `entry/compose/rpg.ts`).
//
// ONE immediate-write control, so the shared row renders Reset alone (no draft ⇒ a Save button would be dead
// chrome — the operations-section shape). Applies to the NEXT request: the resolved-config cache is rebuilt on
// every admin write, and the request builder reads it per call.

import type { AppSettings, StructuredOutputShape } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations";
import { envFloor, isOverridden, saveStateOf } from "../lib/app-override-model";
import { STRUCTURED_OUTPUT_SHAPE_ITEMS, STRUCTURED_OUTPUT_SHAPE_LABELS } from "../lib/structured-output-items";
import { STRUCTURED_OUTPUT_SUBCATEGORY } from "../lib/structured-output-nav";
import { AdminOverrideResetRow, AdminOverrideSelect } from "./admin-override-field";

/** The mechanism, short enough for the row's info tooltip. The WHEN-TO-SWITCH copy is deliberately NOT here:
 *  `SettingRow`'s hint is hover-only chrome, and this knob's whole reason for existing is unreadable without
 *  it — the paragraph that tells an admin when to touch this is always-visible section copy below. */
const SHAPE_HINT =
  "Strict-compatible marks every field required and spells each optional field as “value or null”. The reply parser reads a null exactly as if the field had been left out, so what the model may answer is unchanged.";

/** The section's own suspense/error boundary — it reads for itself, so it must recover for itself. */
export function StructuredOutputSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading structured output…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="structured output — administrators only" onRetry={retry} />}
    >
      <StructuredOutputBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function StructuredOutputBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const save = useUpdateAppOverrides({ trpc, invalidation });
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  const shape = data.resolved.structuredOutputShape;
  const overridden = isOverridden(data.overrides.structuredOutputShape);

  const write = (partial: AppSettings): void => {
    save.mutateAsync({ partial }).catch(() => undefined); // the sticky save.error slot surfaces the failure
  };

  return (
    <Section
      className="@container"
      divider={true}
      heading={STRUCTURED_OUTPUT_SUBCATEGORY.label}
      id={settingsAnchorId("admin", STRUCTURED_OUTPUT_SUBCATEGORY.id)}
    >
      <Stack gap="field">
        <Text voice="gloss">How schema-constrained requests describe their JSON to the model. Applies to the next request — no restart.</Text>
        <AdminOverrideSelect
          label="JSON-Schema shape"
          hint={SHAPE_HINT}
          value={shape}
          items={STRUCTURED_OUTPUT_SHAPE_ITEMS}
          overridden={overridden}
          floorLabel={envFloor(overridden, STRUCTURED_OUTPUT_SHAPE_LABELS[shape])}
          onSet={(next): void => write({ structuredOutputShape: next as StructuredOutputShape })}
        />
        {/* WHEN to touch this — always visible, never tooltip-only: the reader reaching for this knob has a
            provider error in the other window and needs the symptom named, not the JSON-Schema spec. */}
        <Text voice="gloss">
          Switch to Strict-compatible when a provider REJECTS our schema. Two known walls: OpenAI's strict mode requires every field to be listed as required,
          and Claude's grammar compiler refuses a schema that carries too many optional fields — the strict shape clears both. It costs one extra explicit null
          per unset field, which small local models handle worse, so leave it As projected unless a request is failing.
        </Text>
        <AdminOverrideResetRow
          anyOverridden={overridden}
          saving={save.isPending}
          errored={save.error !== null}
          onReset={(): void => write({ structuredOutputShape: null })}
        />
      </Stack>
    </Section>
  );
}
