// The Media & trust admin SECTION (SET-SEAMS stage 4) — the deployment-wide content-render gates
// (forbidExternalMedia, trustHtml) plus the generated-image download cap. Was the System pane's first
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

import type { AppSettings } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations";
import { envFloor, isOverridden, saveStateOf } from "../lib/app-override-model";
import { MEDIA_TRUST_SUBCATEGORY } from "../lib/system-config-nav";
import { AdminOverrideField, AdminOverrideResetRow, AdminOverrideSwitch } from "./admin-override-field";

/** Decimal MB (1 MB = 1e6 B, matching safeFetch's own byte accounting) — the cap is edited in MB and
 *  written in BYTES. */
const BYTES_PER_MB = 1_000_000;
// A local mirror of the contract's private byte floor/ceiling; a client-side UX clamp only — the schema
// re-validates at the transport (and an out-of-range value would trip its `.catch`, silently no-opping the
// save, so the clamp is what keeps a fat-fingered number from looking like a successful write).
const MAX_IMAGE_MB_MIN = 0.1;
const MAX_IMAGE_MB_MAX = 100;
const MAX_IMAGE_MB_STEP = 1;

/** The MB draft for a byte value. */
function toMbDraft(bytes: number): string {
  return String(bytes / BYTES_PER_MB);
}

/** The MB draft as a schema-legal byte count, or `null` for a blank/non-finite/out-of-range draft (Save
 *  stays disabled rather than sending a value the schema would drop). */
function toBytes(draft: string): number | null {
  const mb = Number(draft);
  if (!Number.isFinite(mb) || draft.trim() === "" || mb < MAX_IMAGE_MB_MIN || mb > MAX_IMAGE_MB_MAX) {
    return null;
  }
  return Math.round(mb * BYTES_PER_MB);
}

/** The section's own suspense/error boundary — it reads for itself, so it must recover for itself. */
export function MediaTrustSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading media &amp; trust…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="media & trust — administrators only" onRetry={retry} />}
    >
      <MediaTrustBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function MediaTrustBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const save = useUpdateAppOverrides({ trpc, invalidation });

  const resolved = data.resolved;
  const overrides = data.overrides;
  const [maxImageDraft, setMaxImageDraft] = useState<string>(() => toMbDraft(resolved.maxImageBytes));
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  const bytes = toBytes(maxImageDraft);
  const dirty = bytes !== null && bytes !== resolved.maxImageBytes;
  const forbidOverridden = isOverridden(overrides.forbidExternalMedia);
  const trustOverridden = isOverridden(overrides.trustHtml);
  const capOverridden = isOverridden(overrides.maxImageBytes);
  const anyOverridden = forbidOverridden || trustOverridden || capOverridden;

  // Every write names ONLY this section's keys (S1) — the switches write immediately (a toggle IS the
  // override), the cap batches through Save.
  const write = (partial: AppSettings): void => {
    save.mutateAsync({ partial }).catch(() => undefined); // the sticky save.error slot surfaces the failure
  };
  // Reset clears this section's three keys to the floor. All three are TOP-LEVEL scalars, so a plain `null`
  // each is the merge-clear (no nested-object hazard here). Re-sync the draft to the RESOLVED floor the
  // reset returned so the input VALUE flips alongside the "Using the deployment default" copy.
  const onReset = (): void => {
    save
      .mutateAsync({ partial: { forbidExternalMedia: null, trustHtml: null, maxImageBytes: null } })
      .then((resolvedAfter) => setMaxImageDraft(toMbDraft(resolvedAfter.maxImageBytes)))
      .catch(() => undefined);
  };

  return (
    <Section className="@container" divider={true} heading={MEDIA_TRUST_SUBCATEGORY.label} id={settingsAnchorId("admin", MEDIA_TRUST_SUBCATEGORY.id)}>
      <Stack gap="field">
        <Text voice="gloss">Deployment-wide content-render gates. A per-character override may TIGHTEN these, never loosen them.</Text>
        <AdminOverrideSwitch
          label="Block external media"
          hint="Stop rendered chat content from loading http/https media URLs — a privacy/SSRF guard (the load itself is the tracking-pixel). Enforced by the page's Content-Security-Policy as well as the renderer, so it is a deployment CEILING and a change only reaches an open tab on RELOAD."
          value={resolved.forbidExternalMedia}
          overridden={forbidOverridden}
          floorLabel={envFloor(forbidOverridden, resolved.forbidExternalMedia ? "on" : "off")}
          onSet={(next): void => write({ forbidExternalMedia: next })}
        />
        <AdminOverrideSwitch
          label="Render rich HTML as trusted"
          hint="Render rich HTML cards + Mermaid diagrams as trusted by default across the deployment. Off keeps the untrusted-by-default posture; a per-character override still layers on top."
          value={resolved.trustHtml}
          overridden={trustOverridden}
          floorLabel={envFloor(trustOverridden, resolved.trustHtml ? "on" : "off")}
          onSet={(next): void => write({ trustHtml: next })}
        />
        <AdminOverrideField
          label="Max generated-image download (MB)"
          hint="Byte cap for a generated-image download fetched from a provider URL. Raise it for high-res models."
          value={maxImageDraft}
          onChange={setMaxImageDraft}
          overridden={capOverridden}
          floorValue={envFloor(capOverridden, resolved.maxImageBytes / BYTES_PER_MB)}
          min={MAX_IMAGE_MB_MIN}
          max={MAX_IMAGE_MB_MAX}
          step={MAX_IMAGE_MB_STEP}
        />
        <AdminOverrideResetRow
          dirty={dirty}
          anyOverridden={anyOverridden}
          saving={save.isPending}
          errored={save.error !== null}
          onSave={(): void => {
            if (bytes !== null) {
              write({ maxImageBytes: bytes });
            }
          }}
          onReset={onReset}
        />
      </Stack>
    </Section>
  );
}
