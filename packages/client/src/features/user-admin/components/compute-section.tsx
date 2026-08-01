// The Compute admin SECTION (SET-SEAMS stage 4) — the vLLM runner fan-out (`vllmConcurrency.embed` /
// `.summarize`), a HOT policy that applies on next use (unlike the restart-gated launch flags in the Engines
// section, and unlike the agent-SDK's own summarize concurrency in System tuning).
//
// A self-owned settings-SECTION CONTRIBUTION at the `admin` anchor (the System pane decomposed, §10 Q2), on
// the same floor-vs-override read as every other AppSettings section. It owns the WHOLE `vllmConcurrency`
// key, so its Reset is the merge-safe top-level `null` clear.

import type { VllmConcurrency } from "@orb/contracts/settings";
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
import { COMPUTE_SUBCATEGORY } from "../lib/system-config-nav";
import { AdminOverrideField, AdminOverrideResetRow } from "./admin-override-field";

// Both leaves are positive ints in the schema; a value below this would fail parse and trip
// `vllmConcurrency`'s `.catch(undefined)`, silently wiping BOTH overrides — so the draft never sends one.
const CONCURRENCY_MIN = 1;
const CONCURRENCY_STEP = 1;

const FIELDS = [
  { key: "embed", label: "Embedding concurrency", hint: "Parallel batches for the embed + image-embed vLLM runners." },
  { key: "summarize", label: "Summarize concurrency", hint: "Parallel batches for the gen-engine summarize runner." },
] as const satisfies readonly { key: keyof VllmConcurrency; label: string; hint: string }[];

type Draft = Record<keyof VllmConcurrency, string>;

/** The only-moved-leaves delta. A blank/non-finite/below-floor draft is omitted (Save stays disabled). */
function diffConcurrency(baseline: Draft, draft: Draft): VllmConcurrency {
  const patch: Record<string, number> = {};
  for (const { key } of FIELDS) {
    const n = Number(draft[key]);
    if (Number.isFinite(n) && n >= CONCURRENCY_MIN && String(Math.round(n)) !== baseline[key]) {
      patch[key] = Math.round(n);
    }
  }
  return patch;
}

/** The section's own suspense/error boundary — it reads for itself, so it must recover for itself. */
export function ComputeSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading compute…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="compute — administrators only" onRetry={retry} />}
    >
      <ComputeBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function ComputeBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const save = useUpdateAppOverrides({ trpc, invalidation });

  const resolved = data.resolved.vllmConcurrency;
  const stored = data.overrides.vllmConcurrency ?? null;
  const baseline: Draft = { embed: String(resolved.embed), summarize: String(resolved.summarize) };
  const [draft, setDraft] = useState<Draft>(() => baseline);
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  const patch = diffConcurrency(baseline, draft);
  const dirty = Object.keys(patch).length > 0;
  const anyOverridden = FIELDS.some(({ key }) => isOverridden(stored?.[key]));

  // The delta MERGES over the stored override so the untouched sibling leaf survives the write (the server
  // deep-merges, but sending the moved leaf alone is what keeps the patch key-minimal, S1).
  const onSave = (): void => {
    save.mutateAsync({ partial: { vllmConcurrency: { ...(stored ?? {}), ...patch } } }).catch(() => undefined);
  };
  // This section owns the whole key → the merge-safe top-level clear. Re-sync the draft to the floor the
  // reset returned so each input VALUE flips alongside its "Using the deployment default" copy.
  const onReset = (): void => {
    save
      .mutateAsync({ partial: { vllmConcurrency: null } })
      .then((after) => setDraft({ embed: String(after.vllmConcurrency.embed), summarize: String(after.vllmConcurrency.summarize) }))
      .catch(() => undefined);
  };

  return (
    <Section className="@container" divider={true} heading={COMPUTE_SUBCATEGORY.label} id={settingsAnchorId("admin", COMPUTE_SUBCATEGORY.id)}>
      <Stack gap="field">
        <Text voice="gloss">Local vLLM runner fan-out. Applies to the next batch — no engine restart.</Text>
        {FIELDS.map(({ key, label, hint }) => (
          <AdminOverrideField
            key={key}
            label={label}
            hint={hint}
            value={draft[key]}
            onChange={(next): void => setDraft((d) => ({ ...d, [key]: next }))}
            overridden={isOverridden(stored?.[key])}
            floorValue={envFloor(isOverridden(stored?.[key]), resolved[key])}
            min={CONCURRENCY_MIN}
            step={CONCURRENCY_STEP}
          />
        ))}
        <AdminOverrideResetRow
          dirty={dirty}
          anyOverridden={anyOverridden}
          saving={save.isPending}
          errored={save.error !== null}
          onSave={onSave}
          onReset={onReset}
        />
      </Stack>
    </Section>
  );
}
