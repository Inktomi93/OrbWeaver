import { useRef } from "react";
// The SYSTEM settings surface (Task #37 — the APP-tier AppSettings home; UI-Arch §13.4 form-factory
// panel). Renders inside the shell's settings modal, mounted by SettingsShell for the `system` category.
// Reads the RESOLVED effective config via `getAppSettings` (env floor ⊕ DB override; QueryBoundary +
// useSuspenseQueries alongside `sessions.me` for the viewer's role) and autosaves each change back through
// `updateAppSettings` — but as a DELTA against the mount baseline (system-settings-model.ts `diffSystemPatch`),
// so ONLY a field the admin actually moved becomes a stored override and an untouched env-mirrored field
// (`corpusAutoindex`/`logLevel`) keeps showing its environment value (the write-pinning trap the appearance
// surface's whole-section write would hit here — appearance has no env floor; AppSettings does).
//
// AUTHORITY (Spine-Identity §5.1): `getAppSettings`/`updateAppSettings` are admin-gated at the transport
// (`adminProcedure`) AND re-checked in the verb (`requireAdmin` = owner ∪ admin). The single-user OWNER
// sails through. The D17 owner-box GOVERNANCE toggles (Shared access) additionally require the box OWNER
// server-side (`requireOwner`), so a delegated (non-owner) admin sees them DISABLED — a members-never-see-
// host-affordances read of the box-governance split; the enforcement floor is the verb, this is just honest
// UX so a non-owner can't flip a control that would only bounce off the server.
//
// ENV-FLOOR HONESTY (cheap version — Task #37 §3): `getAppSettings` returns ONLY the resolved effective
// config, never the stored-vs-floor split, so a per-field "set by environment" annotation is NOT cheaply
// available (it would need a new server read exposing the raw override) — deferred. The pane shows the
// effective values with a footnote that overrides layer over environment defaults.

import type { AppSettings, EffectiveAppConfig } from "@orb/contracts/settings";
import { Button } from "@orb/ui/button";
import { FieldLayout } from "@orb/ui/field";
import { Container, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import {
  SYSTEM_SETTINGS_ENTITY_ID,
  useSystemSettingsForm,
} from "../hooks/use-system-settings-form";
import { SYSTEM_SUBCATEGORY_IDS, settingsAnchorId } from "../lib/settings-nav";
import type { SystemSettingsForm } from "../lib/system-settings-model";
import {
  CONCURRENCY_MIN,
  diffSystemPatch,
  LOCAL_COMPUTE_BUDGET_MIN,
  LOG_LEVEL_ITEMS,
  MAX_IMAGE_MB_MAX,
  MAX_IMAGE_MB_MIN,
  MAX_IMAGE_MB_STEP,
  projectSystemForm,
} from "../lib/system-settings-model";

// The AppSettings override write (module scope, §13.1). NOT bus-driven — AppSettings emits no per-chat bus
// event, so it self-invalidates `getAppSettings` on settle (the required non-bus freshness source).
interface UpdateSystemVars {
  readonly partial: AppSettings;
}
const useUpdateSystem = createEntityMutation<UpdateSystemVars, EffectiveAppConfig>({
  options: (trpc) => trpc.settings.updateAppSettings.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getAppSettings.queryFilter()],
  errorToast: "Couldn't save the system settings.",
});

/** The DOM anchor id for one System subcategory `<Section>` — derived from the shared registry ids so a
 *  rename is a `tsc` error, never a stale anchor. */
const anchor = (sub: string): string => settingsAnchorId("system", sub);

/** The System panel body (rendered inside the settings modal's category column). */
export function SystemSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading system settings…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load system settings — they're available to administrators only.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <FieldLayout orientation="horizontal">
          <Container>
            <SystemForm />
          </Container>
        </FieldLayout>
      </QueryBoundary>
    </Stack>
  );
}

/** Suspends on the effective-config + viewer reads, then binds the delta-autosave form to AppSettings. */
function SystemForm(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: config }, { data: viewer }] = useSuspenseQueries({
    queries: [trpc.settings.getAppSettings.queryOptions(), trpc.sessions.me.queryOptions()],
  });
  const update = useUpdateSystem({ trpc, invalidation });

  // The mount baseline: only fields moved AWAY from it are written as overrides (see the file header).
  const serverForm = projectSystemForm(config);
  const baselineRef = useRef(serverForm);

  const save = (values: SystemSettingsForm): Promise<unknown> =>
    update.mutateAsync({ partial: diffSystemPatch(baselineRef.current, values) });

  const { form, mountKey } = useSystemSettingsForm({
    entityId: SYSTEM_SETTINGS_ENTITY_ID,
    serverValues: serverForm,
    save,
  });

  // The D17 owner-box governance toggles are `requireOwner` server-side — a delegated (non-owner) admin
  // sees them read-only rather than able to trip a bounce-off-the-server save.
  const ownerOnly = viewer?.globalRole !== "owner";

  return (
    <Stack key={mountKey} gap="section">
      <Stack gap="section">
        <Section
          divider={true}
          heading="Media & trust"
          id={anchor(SYSTEM_SUBCATEGORY_IDS.mediaTrust)}
        >
          <form.AppField name="forbidExternalMedia">
            {(field): ReactElement => (
              <field.SwitchField
                label="Block external media"
                description="Stop rendered chat content from loading http/https media URLs — a privacy/SSRF guard (the load itself is the tracking-pixel). A per-character override still layers on top."
              />
            )}
          </form.AppField>
          <form.AppField name="trustHtml">
            {(field): ReactElement => (
              <field.SwitchField
                label="Render rich HTML as trusted"
                description="Render rich HTML cards + Mermaid diagrams as trusted by default across the deployment. Off keeps the untrusted-by-default posture; a per-character override still layers on top."
              />
            )}
          </form.AppField>
          <form.AppField name="maxImageMb">
            {(field): ReactElement => (
              <field.NumberField
                label="Max generated-image download (MB)"
                description="Byte cap for a generated-image download fetched from a provider URL. Raise it for high-res models."
                min={MAX_IMAGE_MB_MIN}
                max={MAX_IMAGE_MB_MAX}
                step={MAX_IMAGE_MB_STEP}
              />
            )}
          </form.AppField>
        </Section>

        <Section divider={true} heading="Compute" id={anchor(SYSTEM_SUBCATEGORY_IDS.compute)}>
          <form.AppField name="vllmEmbedConcurrency">
            {(field): ReactElement => (
              <field.NumberField
                label="Embedding concurrency"
                description="Parallel batches for the embed + image-embed vLLM runners."
                min={CONCURRENCY_MIN}
              />
            )}
          </form.AppField>
          <form.AppField name="vllmSummarizeConcurrency">
            {(field): ReactElement => (
              <field.NumberField
                label="Summarize concurrency"
                description="Parallel batches for the gen-engine summarize runner."
                min={CONCURRENCY_MIN}
              />
            )}
          </form.AppField>
        </Section>

        <Section
          divider={true}
          heading="Shared access"
          id={anchor(SYSTEM_SUBCATEGORY_IDS.sharedAccess)}
        >
          <form.AppField name="allowNonOwnerLocalCompute">
            {(field): ReactElement => (
              <field.SwitchField
                label="Members may use shared local compute"
                description="Let non-owner members drive your shared local compute (vLLM + in-process models). Local is shared-by-design; only the box owner can change this."
                disabled={ownerOnly}
              />
            )}
          </form.AppField>
          <form.AppField name="nonOwnerLocalComputeBudget">
            {(field): ReactElement => (
              <field.NumberField
                label="Per-member local-compute budget"
                description="Per-member turn/request budget for shared local compute. Empty = the domain floor (unbounded). Owner-only."
                min={LOCAL_COMPUTE_BUDGET_MIN}
                disabled={ownerOnly}
              />
            )}
          </form.AppField>
          <form.AppField name="allowNonOwnerMaxProSub">
            {(field): ReactElement => (
              <field.SwitchField
                label="Members may use the hosted subscription"
                description="Let non-owner members drive your hosted max/pro subscription (ban-prone + real money). Off by default; only the box owner can change this."
                disabled={ownerOnly}
              />
            )}
          </form.AppField>
        </Section>

        <Section divider={true} heading="Operations" id={anchor(SYSTEM_SUBCATEGORY_IDS.operations)}>
          <form.AppField name="corpusAutoindex">
            {(field): ReactElement => (
              <field.SwitchField
                label="Background corpus indexing"
                description="Keep the library's embedding index up to date in the background as content changes."
              />
            )}
          </form.AppField>
          <form.AppField name="logLevel">
            {(field): ReactElement => (
              <field.SelectField
                label="Log level"
                description="Server log verbosity. Applied live — no restart needed."
                items={LOG_LEVEL_ITEMS}
              />
            )}
          </form.AppField>
        </Section>
      </Stack>
      {/* Env-floor honesty footnote (see the file header — the per-field "set by environment" annotation is
          deferred; the read verb exposes only the resolved effective value). */}
      <Text size="micro" tone="muted">
        Values reflect the effective configuration — environment defaults with any saved overrides
        applied. Only the fields you change are saved as overrides.
      </Text>
    </Stack>
  );
}
