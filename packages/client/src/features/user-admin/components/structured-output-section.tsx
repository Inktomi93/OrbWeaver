// The Structured-output admin SECTION (D126) — the deployment's answer to "how do we spell an OPTIONAL field
// when a request must come back as schema-shaped JSON". The engine + both shapes were built 2026-08-03
// (`@orb/contracts/inference` `scrubWireSchema`); until this section they were selectable only by editing a source
// constant and redeploying, which is a dead switch (D107) — the capability existed and nobody could reach it.
//
// A settings-SECTION CONTRIBUTION (SET-SEAMS §6c) at the `admin` anchor, owned by user-admin (it owns every
// AppSettings-tier section; the knob has no client reader to home with — it is consumed server-side by the
// extraction request builder, `entry/compose/rpg.ts`).
//
// ONE immediate-write control, so the shared row renders Reset alone (no draft ⇒ a Save button would be dead
// chrome — the operations-section shape). Applies to the NEXT request: the resolved-config cache is rebuilt on
// every admin write, and the request builder reads it per call.

import type { StructuredOutputVehicle } from "@orb/contracts/role-clients";
import type { AppSettings, StructuredOutputShape } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations.ts";
import { envFloor, isOverridden, saveStateOf } from "../lib/app-override-model.ts";
import {
  STRUCTURED_OUTPUT_SHAPE_ITEMS,
  STRUCTURED_OUTPUT_SHAPE_LABELS,
  STRUCTURED_OUTPUT_VEHICLE_ITEMS,
  STRUCTURED_OUTPUT_VEHICLE_LABELS,
} from "../lib/structured-output-items.ts";
import { STRUCTURED_OUTPUT_SUBCATEGORY } from "../lib/structured-output-nav.ts";
import { AdminOverrideResetRow, AdminOverrideSelect } from "./admin-override-field.tsx";

/** The mechanism, short enough for the row's info tooltip. The WHEN-TO-SWITCH copy is deliberately NOT here:
 *  `SettingRow`'s hint is hover-only chrome, and this knob's whole reason for existing is unreadable without
 *  it — the paragraph that tells an admin when to touch this is always-visible section copy below. */
const SHAPE_HINT =
  "Strict-compatible marks every field required and spells each optional field as “value or null”. The reply parser reads a null exactly as if the field had been left out, so what the model may answer is unchanged.";

/** Same rule as SHAPE_HINT: the mechanism fits a tooltip, the when-to-switch paragraph does not and lives in
 *  always-visible section copy below. */
const VEHICLE_HINT =
  "Enforced schema puts the schema in the request's own structured-output field, so the provider constrains what the model may emit. Forced tool call hands the same schema to the model as a tool it must call — universally accepted, but not enforced.";

/** The section's own suspense/error boundary — it reads for itself, so it must recover for itself. */
export function StructuredOutputSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    // RESERVED (#1098) — an admin settings section that settles into an override knob stack.
    <QueryBoundary
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="structured output — administrators only" onRetry={retry} />}
      reserveKey="config.admin.structuredOutput"
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
  const vehicle = data.resolved.structuredOutputVehicle;
  const vehicleOverridden = isOverridden(data.overrides.structuredOutputVehicle);

  const write = (partial: AppSettings): void => {
    save.mutateAsync({ partial }).catch(() => undefined); // the sticky save.error slot surfaces the failure
  };

  return (
    <Section className="@container" divider={true} heading={STRUCTURED_OUTPUT_SUBCATEGORY.label} id={configAnchorId("admin", STRUCTURED_OUTPUT_SUBCATEGORY.id)}>
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
        {/* THE SECOND, COMPOSING AXIS (task #36). Shape = how we spell an optional field; delivery = which
            endpoint feature carries the schema. They are deliberately two knobs: the pairing the live probe
            found servable everywhere is strict-compatible SHAPE + enforced DELIVERY, and entangling them
            would remove the admin's ability to move one after a provider changes its mind about the other. */}
        <AdminOverrideSelect
          label="Schema delivery"
          hint={VEHICLE_HINT}
          value={vehicle}
          items={STRUCTURED_OUTPUT_VEHICLE_ITEMS}
          overridden={vehicleOverridden}
          floorLabel={envFloor(vehicleOverridden, STRUCTURED_OUTPUT_VEHICLE_LABELS[vehicle])}
          onSet={(next): void => write({ structuredOutputVehicle: next as StructuredOutputVehicle })}
        />
        <Text voice="gloss">
          Automatic sends the enforced schema to models whose providers support it and falls back to a forced tool call for the rest — leave it there unless a
          model is failing. Enforced schema forces the strict route everywhere, which fails loudly on a provider that cannot compile it rather than quietly
          accepting free-form JSON. Forced tool call is the older route: it works on every provider but the model is asked to follow the schema, not made to.
        </Text>
        <AdminOverrideResetRow
          anyOverridden={overridden || vehicleOverridden}
          saving={save.isPending}
          errored={save.error !== null}
          onReset={(): void => write({ structuredOutputShape: null, structuredOutputVehicle: null })}
        />
      </Stack>
    </Section>
  );
}
