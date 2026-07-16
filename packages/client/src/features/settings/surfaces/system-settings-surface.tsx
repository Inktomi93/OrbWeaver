import { useRef } from "react";
// The System settings surface. Reads the resolved effective config via getAppSettings and autosaves each
// change back through updateAppSettings as a delta against the mount baseline (diffSystemPatch), so only
// a field the admin actually moved becomes a stored override.
//
// getAppSettings/updateAppSettings are admin-gated at the transport and re-checked in the verb. The D17
// owner-box governance toggles additionally require the box owner server-side, so a delegated (non-owner)
// admin sees them disabled rather than able to trip a bounce-off-the-server save.
//
// getAppSettings returns only the resolved effective config, never the stored-vs-floor split, so a
// per-field "set by environment" annotation is deferred — the pane shows a footnote instead.

import type { AppSettings, EffectiveAppConfig } from "@orb/contracts/settings";
import { FieldLayout } from "@orb/ui/field";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { AutosaveStatus } from "#forms";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { SYSTEM_SETTINGS_ENTITY_ID, useSystemSettingsForm } from "../hooks/use-system-settings-form";
import { LOG_LEVEL_ITEMS } from "../lib/log-level-items";
import { SYSTEM_SUBCATEGORY_IDS } from "../lib/system-nav";
import type { SystemSettingsForm } from "../lib/system-settings-model";
import {
  CONCURRENCY_MIN,
  diffSystemPatch,
  LOCAL_COMPUTE_BUDGET_MIN,
  MAX_IMAGE_MB_MAX,
  MAX_IMAGE_MB_MIN,
  MAX_IMAGE_MB_STEP,
  projectSystemForm,
} from "../lib/system-settings-model";

// Not bus-driven — AppSettings emits no per-chat bus event, so it self-invalidates on settle.
interface UpdateSystemVars {
  readonly partial: AppSettings;
}
const useUpdateSystem = createEntityMutation<UpdateSystemVars, EffectiveAppConfig>({
  options: (trpc) => trpc.settings.updateAppSettings.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getAppSettings.queryFilter()],
  errorToast: "Couldn't save the system settings.",
});

const anchor = (sub: string): string => settingsAnchorId("system", sub);

/** The System panel body (rendered inside the settings modal's category column). */
export function SystemSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading system settings…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="system settings — they're available to administrators only" onRetry={retry} />}
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

  // Two baselines (see system-settings-model.ts diffSystemPatch): `lastSaved` is refreshed from every save result so a toggle-back genuinely clears its server-side override.
  const serverForm = projectSystemForm(config);
  const originalRef = useRef(serverForm);
  const lastSavedRef = useRef(serverForm);

  const save = async (values: SystemSettingsForm): Promise<EffectiveAppConfig> => {
    const partial = diffSystemPatch({ original: originalRef.current, lastSaved: lastSavedRef.current }, values);
    const result = await update.mutateAsync({ partial });
    lastSavedRef.current = projectSystemForm(result);
    return result;
  };

  const { form, mountKey, saveState, retrySave } = useSystemSettingsForm({
    entityId: SYSTEM_SETTINGS_ENTITY_ID,
    serverValues: serverForm,
    save,
  });

  const ownerOnly = viewer.globalRole !== "owner";

  return (
    <Stack key={mountKey} gap="section">
      <Stack gap="section">
        <Section divider={true} heading="Media & trust" id={anchor(SYSTEM_SUBCATEGORY_IDS.mediaTrust)}>
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
              <field.NumberField label="Embedding concurrency" description="Parallel batches for the embed + image-embed vLLM runners." min={CONCURRENCY_MIN} />
            )}
          </form.AppField>
          <form.AppField name="vllmSummarizeConcurrency">
            {(field): ReactElement => (
              <field.NumberField label="Summarize concurrency" description="Parallel batches for the gen-engine summarize runner." min={CONCURRENCY_MIN} />
            )}
          </form.AppField>
        </Section>

        <Section divider={true} heading="Shared access" id={anchor(SYSTEM_SUBCATEGORY_IDS.sharedAccess)}>
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

        <Section divider={true} heading="Multi-user" id={anchor(SYSTEM_SUBCATEGORY_IDS.multiUser)}>
          <form.AppField name="localMultiUser">
            {(field): ReactElement => (
              <field.SwitchField
                label="Allow multiple humans (local mode)"
                description="Let additional humans be invited and seated in rooms on a local-mode install. Off = single-human (multi-character chats always work). No effect outside local mode. Owner-only."
                disabled={ownerOnly}
              />
            )}
          </form.AppField>
          <form.AppField name="discreetLogin">
            {(field): ReactElement => (
              <field.SwitchField
                label="Discreet login"
                description="Show a blank sign-in form — no handle pre-fill on the login page (no account enumeration)."
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
              <field.SelectField label="Log level" description="Server log verbosity. Applied live — no restart needed." items={LOG_LEVEL_ITEMS} />
            )}
          </form.AppField>
        </Section>
      </Stack>
      <Row gap="field" align="center">
        <AutosaveStatus state={saveState} onRetry={retrySave} />
        <Text size="micro" tone="muted">
          · Values reflect the effective configuration — environment defaults with any saved overrides applied. Only the fields you change are saved as
          overrides.
        </Text>
      </Row>
    </Stack>
  );
}
