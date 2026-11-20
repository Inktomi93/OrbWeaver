// The install's Character trust defaults (SET-SEAMS stage 4) — the deployment-wide content-render gates
// (defaultHtmlStep, forbidExternalMedia), read as the same one block a character's Trust tab shows. The image size cap lives beside the databank upload cap in System tuning. Was the System pane's first
// group; it is a self-owned settings-SECTION CONTRIBUTION at the `admin` anchor now (§10 Q2 merged the
// system pane into admin).
//
// It reads `getAppSettingsWithOverrides` instead of the resolved-only `getAppSettings` the pane used, so
// each row says whether it is an ACTIVE override or the deployment floor — the per-field honesty the pane
// deferred to a footnote (§4: "the footnote dies"). The section's baseline is its OWN slice of the resolved
// config; its patch names only its OWN keys (S1), so a sibling admin section's save can't clobber it.
//
// Owned by user-admin: an APP-tier admin knob homes with the feature that owns the admin config surfaces
// (the memory-tuning / rate-limits precedent — memoryDefaults is READ by chat/memory yet edited here),
// never with the feature that happens to consume it at runtime.

import type { HtmlTrustStep } from "@orb/contracts/chat";
import { HTML_TRUST_STEPS } from "@orb/contracts/chat";
import type { AppSettings } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary, SettingRowGroup, useFirstBootRows } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { saveStateOf, useReportSaveStatus } from "#forms";
import { DEFAULT_HTML_STEP_SETTING_LABEL, HTML_TRUST_STEP_LABELS, LOAD_INTERNET_MEDIA_LABEL, rethrowUnlessTrpcFailure } from "#lib";
import { configSettingControlId, DEFAULT_HTML_STEP_CONFIG_SETTING, FORBID_EXTERNAL_MEDIA_CONFIG_SETTING } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations.ts";
import { envFloor, isOverridden } from "../lib/app-override-model.ts";
import { MEDIA_TRUST_SUBCATEGORY } from "../lib/system-config-nav.ts";
import { AdminOverrideResetRow, AdminOverrideSelect, AdminOverrideSwitch } from "./admin-override-field.tsx";

const DEFAULT_HTML_STEP_ITEMS = HTML_TRUST_STEPS.map((step) => ({ value: step, label: HTML_TRUST_STEP_LABELS[step] }));

// Narrowed by membership, never cast: the select hands back a string.
function htmlTrustStepOf(value: string): HtmlTrustStep | undefined {
  return HTML_TRUST_STEPS.find((step): boolean => step === value);
}

/** The section's own suspense/error boundary — it reads for itself, so it must recover for itself. */
export function MediaTrustSection({ anchorId, sectionId }: { readonly anchorId: string; readonly sectionId: string }): ReactElement {
  const firstBootRows = useFirstBootRows({ wide: 8, narrow: 10 });
  return (
    // RESERVED (#1098) — an admin settings section that settles into an override knob stack.
    <QueryBoundary
      resetKeys={[]}
      fallback={<SkeletonRows count={4} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="media & trust: administrators only" onRetry={retry} />}
      reserveRows={firstBootRows}
      reserveKey="config.admin.mediaTrust"
    >
      <MediaTrustBody anchorId={anchorId} sectionId={sectionId} />
    </QueryBoundary>
  );
}

function MediaTrustBody({ anchorId, sectionId }: { readonly anchorId: string; readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const save = useUpdateAppOverrides({ trpc, invalidation, failureShownInline: "the admin section's save error line" });

  const resolved = data.resolved;
  const overrides = data.overrides;
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));
  const forbidOverridden = isOverridden(overrides.forbidExternalMedia);
  const stepOverridden = isOverridden(overrides.defaultHtmlStep);
  const anyOverridden = forbidOverridden || stepOverridden;

  // Every write names ONLY this section's keys (S1); both controls write immediately (a toggle IS the override).
  const write = (partial: Pick<AppSettings, "forbidExternalMedia" | "defaultHtmlStep">): void => {
    save.mutateAsync({ partial }).catch(rethrowUnlessTrpcFailure); // the sticky save.error slot surfaces the failure
  };
  // Reset clears this section's two keys to the floor. Both are TOP-LEVEL scalars, so a plain `null` each is the
  // merge-clear (no nested-object hazard here).
  const onReset = (): void => {
    save.mutateAsync({ partial: { forbidExternalMedia: null, defaultHtmlStep: null } }).catch(rethrowUnlessTrpcFailure);
  };

  return (
    <Section container={true} divider={true} heading={MEDIA_TRUST_SUBCATEGORY.label} id={anchorId}>
      <Stack gap="field">
        <Text voice="gloss" prose={true} cap="prose">
          A character's own HTML setting wins over the default. A character can turn internet media off for itself. It can't turn it on while it is off here. A
          script can tell its author that you viewed it, and your IP address.
        </Text>
        <SettingRowGroup>
          {/* The step every inheriting character takes (D294). Interactive by default (owner ruling), and the loudest hint
            in this section: a step below Interactive closes the WebRTC beacon the grant opens, which no
            Content-Security-Policy directive can close, for every inheriting character. A character set to Interactive on
            its own Trust tab keeps it open, and each viewer can turn card scripts off for themselves
            (`UserSettings.chat.runCardScripts`). */}
          <AdminOverrideSelect
            controlId={configSettingControlId("admin", DEFAULT_HTML_STEP_CONFIG_SETTING)}
            label={DEFAULT_HTML_STEP_SETTING_LABEL}
            hint="Characters on “Inherit default” use this. Interactive cards run scripts in a sealed frame: no cookies, no storage, no access to the app or to other cards. A script can still tell its author that you viewed it, and your IP address. Below Interactive, those characters' cards and styled replies run no scripts; a card already on screen stops the next time it loads. A character set to Interactive on its own Trust tab still runs scripts. Rich HTML keeps presets styled without scripts."
            value={resolved.defaultHtmlStep}
            items={DEFAULT_HTML_STEP_ITEMS}
            overridden={stepOverridden}
            floorLabel={envFloor(stepOverridden, HTML_TRUST_STEP_LABELS[resolved.defaultHtmlStep])}
            onSet={(next): void => {
              const step = htmlTrustStepOf(next);
              if (step !== undefined) {
                write({ defaultHtmlStep: step });
              }
            }}
          />
          {/* The install's media ceiling, read as the switch that lets characters' content load internet media. The same
            stored key: on clears the block, off stores it. */}
          <AdminOverrideSwitch
            controlId={configSettingControlId("admin", FORBID_EXTERNAL_MEDIA_CONFIG_SETTING)}
            label={LOAD_INTERNET_MEDIA_LABEL}
            hint="Lets characters' content and your own messages load images and media from the internet. Off blocks them, which also blocks tracking pixels. Messages other people write stay click-to-load. It applies to everyone and takes effect when a tab reloads."
            value={!resolved.forbidExternalMedia}
            overridden={forbidOverridden}
            floorLabel={envFloor(forbidOverridden, resolved.forbidExternalMedia ? "off" : "on")}
            onSet={(next): void => write({ forbidExternalMedia: !next })}
          />
        </SettingRowGroup>
        <AdminOverrideResetRow
          sectionLabel={MEDIA_TRUST_SUBCATEGORY.label}
          anyOverridden={anyOverridden}
          saving={save.isPending}
          error={save.error}
          onReset={onReset}
        />
      </Stack>
    </Section>
  );
}
