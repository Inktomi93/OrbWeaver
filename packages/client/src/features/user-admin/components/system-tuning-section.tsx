// The System-tuning admin SECTION (Phase B ⑩) — the born-in-DB + per-request scalar admin knobs that had no
// editor: the agent-sdk summarize concurrency (Q6), the prompt-transform deadline, the non-owner compute-budget
// WINDOW (the cap's sibling), the model-catalog refresh cadence, the image-variant quality, the databank-upload
// cap (TIGHTEN-only), and the vLLM per-request presence-penalty default (engineLaunch.genPresencePenalty).
// Each shows its deployment floor + whether it's an active override; a section-level Reset clears every ⑩
// override at once. Reads getAppSettingsWithOverrides for the honest floor-vs-override story; saves the
// only-moved-fields delta through the admin-gated updateAppSettings path.
//
// A settings-SECTION CONTRIBUTION (§6c) at the `admin` anchor, owned by user-admin (admin-tier config). These
// all apply LIVE (per request / per batch / per check) — no engine restart, unlike the engineLaunch editor's
// argv flags (genPresencePenalty rides engineLaunch's schema section but is consumed per-request, so it lives
// here with the live knobs, not in the restart-gated launch editor).

import type { AppSettings, EffectiveAppConfig } from "@orb/contracts/settings";
import { IMAGE_VARIANT_QUALITY_MAX, IMAGE_VARIANT_QUALITY_MIN, PROMPT_CACHE_MIN_DEPTH_CEIL, PROMPT_CACHE_MIN_DEPTH_FLOOR } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations.ts";
import { envFloor, isOverridden, saveStateOf } from "../lib/app-override-model.ts";
import { SYSTEM_TUNING_SUBCATEGORY } from "../lib/system-tuning-nav.ts";
import { AdminOverrideField, AdminOverrideResetRow } from "./admin-override-field.tsx";

// One editable scalar knob: how to READ its effective baseline off the resolved config, whether a stored
// OVERRIDE is active, and how to build the sparse PATCH (nested paths handled per-field). `min` guards the
// input; the schema's `.catch` is the real fail-safe (an out-of-bounds value drops → the floor governs).
interface KnobDescriptor {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly step: number;
  readonly min: number;
  readonly max?: number;
  readonly read: (r: EffectiveAppConfig) => number;
  readonly overridden: (o: AppSettings) => boolean;
  readonly patch: (value: number) => AppSettings;
}

const KNOBS: readonly KnobDescriptor[] = [
  {
    id: "agentSdkSummarizeConcurrency",
    label: "Agent-SDK summarize concurrency",
    hint: "Max in-flight summarize calls the Claude-Agent-SDK backend runs (distinct from the vLLM engine's).",
    step: 1,
    min: 1,
    read: (r) => r.agentSdkConcurrency.summarize,
    overridden: (o) => isOverridden(o.agentSdkConcurrency?.summarize),
    patch: (v) => ({ agentSdkConcurrency: { summarize: v } }),
  },
  {
    id: "promptTransformDeadlineMs",
    label: "Prompt-transform deadline (ms)",
    hint: "Per-transform time budget; a transform that outruns it is SKIPPED (the draft passes through unchanged).",
    step: 50,
    min: 1,
    read: (r) => r.promptTransformDeadlineMs,
    overridden: (o) => isOverridden(o.promptTransformDeadlineMs),
    patch: (v) => ({ promptTransformDeadlineMs: v }),
  },
  {
    id: "nonOwnerLocalComputeBudgetWindowMs",
    label: "Non-owner compute-budget window (ms)",
    hint: "The fixed window the per-member local-compute count budget resets on (the budget cap's sibling).",
    step: 3_600_000,
    min: 1,
    read: (r) => r.nonOwnerLocalComputeBudgetWindowMs,
    overridden: (o) => isOverridden(o.nonOwnerLocalComputeBudgetWindowMs),
    patch: (v) => ({ nonOwnerLocalComputeBudgetWindowMs: v }),
  },
  {
    id: "catalogRefreshIntervalMs",
    label: "Model-catalog refresh cadence (ms)",
    hint: "How often a successful model-catalog snapshot refresh is re-enqueued (a failure retries within the hour).",
    step: 3_600_000,
    min: 1,
    read: (r) => r.catalogRefreshIntervalMs,
    overridden: (o) => isOverridden(o.catalogRefreshIntervalMs),
    patch: (v) => ({ catalogRefreshIntervalMs: v }),
  },
  {
    id: "imageVariantQuality",
    label: "Image-variant quality (1–100)",
    hint: "Lossy-encoder quality for derived image variants. Changing it regenerates variants (folded into the cache key).",
    step: 1,
    min: IMAGE_VARIANT_QUALITY_MIN,
    max: IMAGE_VARIANT_QUALITY_MAX,
    read: (r) => r.imageVariantQuality,
    overridden: (o) => isOverridden(o.imageVariantQuality),
    patch: (v) => ({ imageVariantQuality: v }),
  },
  {
    id: "maxDatabankBytes",
    label: "Databank upload cap (bytes)",
    hint: "Max single-document upload. May only TIGHTEN below the 20 MiB route belt; an over-belt value is ignored.",
    step: 1_048_576,
    min: 100_000,
    read: (r) => r.maxDatabankBytes,
    overridden: (o) => isOverridden(o.maxDatabankBytes),
    patch: (v) => ({ maxDatabankBytes: v }),
  },
  {
    id: "promptCacheMinDepth",
    label: "Prompt-cache depth floor (0–20)",
    hint: "How many of the newest exchanges stay OUT of the Anthropic prompt cache. 0 uses each turn's own computed minimum.",
    step: 1,
    min: PROMPT_CACHE_MIN_DEPTH_FLOOR,
    max: PROMPT_CACHE_MIN_DEPTH_CEIL,
    read: (r) => r.promptCacheMinDepth,
    overridden: (o) => isOverridden(o.promptCacheMinDepth),
    patch: (v) => ({ promptCacheMinDepth: v }),
  },
  {
    id: "genPresencePenalty",
    label: "vLLM presence-penalty default",
    hint: "The per-request presence_penalty the vLLM chat surface applies when a preset is silent (any served model, incl. role/side-gen). A preset that sets its own value still wins.",
    step: 0.1,
    min: -2,
    max: 2,
    read: (r) => r.engineLaunch.genPresencePenalty,
    overridden: (o) => isOverridden(o.engineLaunch?.genPresencePenalty),
    patch: (v) => ({ engineLaunch: { genPresencePenalty: v } }),
  },
];

type Draft = Record<string, string>;

function toDraft(resolved: EffectiveAppConfig): Draft {
  const out: Draft = {};
  for (const knob of KNOBS) {
    out[knob.id] = String(knob.read(resolved));
  }
  return out;
}

/** The section's own suspense/error boundary so it is self-contained. */
export function SystemTuningSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading system tuning…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="system tuning — administrators only" onRetry={retry} />}
    >
      <SystemTuningBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function SystemTuningBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const save = useUpdateAppOverrides({ trpc, invalidation });

  const resolved = data.resolved;
  const overrides = data.overrides;
  const [draft, setDraft] = useState<Draft>(() => toDraft(resolved));

  // A knob is dirty when its finite draft differs from the effective baseline. A blank/non-finite draft is
  // never dirty (Save stays disabled), so a wipe-triggering value never reaches the write path.
  const dirtyKnobs = KNOBS.filter((knob) => {
    const n = Number(draft[knob.id]);
    return Number.isFinite(n) && n !== knob.read(resolved);
  });
  const dirty = dirtyKnobs.length > 0;
  const anyOverridden = KNOBS.some((knob) => knob.overridden(overrides));
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  // Merge every dirty knob's sparse patch into ONE partial (nested engineLaunch/agentSdkConcurrency deep-merge
  // server-side, so an untouched sibling in the same section survives).
  const onSave = (): void => {
    const partial: AppSettings = {};
    for (const knob of dirtyKnobs) {
      Object.assign(partial, deepMergePatch(partial, knob.patch(Number(draft[knob.id]))));
    }
    save.mutateAsync({ partial }).catch(() => undefined);
  };
  // Reset clears every ⑩ override to the floor. Flat keys use the top-level `null` (whole-section clear); the
  // NESTED `genPresencePenalty` must be a LEAF `null`, NOT `undefined` — tRPC rides plain JSON, so a nested
  // `undefined` is STRIPPED by JSON.stringify → the server sees `engineLaunch: {}` → deepMerge iterates zero
  // keys → the override survives its own reset. A leaf `null` survives the wire and clears via the recursion
  // (the merge-clear law: `{}` = no-op, `null` = leaf clear). We must NOT send `engineLaunch: null` — that
  // would wipe the whole restart-gated launch config this section doesn't own.
  const onReset = (): void => {
    save
      .mutateAsync({
        partial: {
          agentSdkConcurrency: null,
          promptTransformDeadlineMs: null,
          nonOwnerLocalComputeBudgetWindowMs: null,
          catalogRefreshIntervalMs: null,
          imageVariantQuality: null,
          maxDatabankBytes: null,
          promptCacheMinDepth: null,
          engineLaunch: { genPresencePenalty: null },
        },
      })
      // Re-sync the local draft to the RESOLVED floor the reset returned so each input VALUE flips to its
      // default alongside the "Using the deployment default" copy — otherwise the input keeps the stale typed
      // value (side-eye P2). `useState` runs its initializer once; the mutation result is the server truth.
      .then((resolvedAfter) => setDraft(toDraft(resolvedAfter)))
      .catch(() => undefined);
  };

  return (
    <Section divider={true} heading={SYSTEM_TUNING_SUBCATEGORY.label} id={settingsAnchorId("admin", SYSTEM_TUNING_SUBCATEGORY.id)}>
      <Stack gap="field">
        <Text voice="label" className="text-muted-foreground">
          Deployment-wide runtime tuning. Each applies live (per request / batch / check). Absent knobs run on the deployment floor.
        </Text>
        {KNOBS.map((knob) => (
          <AdminOverrideField
            key={knob.id}
            label={knob.label}
            hint={knob.hint}
            value={draft[knob.id] ?? ""}
            onChange={(next): void => setDraft((d) => ({ ...d, [knob.id]: next }))}
            overridden={knob.overridden(overrides)}
            // `resolved` is floor ⊕ override — the FLOOR only while this knob has no stored override. Once it
            // has one the floor is unrecoverable from this read, so the row points at Reset instead of naming
            // the override as its own default (SET-SEAMS §4).
            floorValue={envFloor(knob.overridden(overrides), knob.read(resolved))}
            min={knob.min}
            {...(knob.max === undefined ? {} : { max: knob.max })}
            step={knob.step}
          />
        ))}
        {/* The prompt-cache knob's clamp, ALWAYS visible (the D126 teaching-copy rider): a `hint` is
            hover-only chrome, and "the number I typed is not the number in use" is exactly the surprise a
            tooltip cannot carry. */}
        <Text voice="gloss">
          The prompt-cache depth floor only ever moves the cache breakpoint DEEPER. Each turn already computes the shallowest depth that is safe for it, and
          keeps that when it is deeper than this number — so a smaller value here changes nothing, and a turn whose prompt is still shifting is never cached at
          all. Raise it if you see cache writes on turns that should have been reads.
        </Text>
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

/** Deep-merge two sparse AppSettings patches so two knobs targeting the SAME nested object (e.g. two
 *  engineLaunch fields) don't clobber each other before the single mutateAsync. Plain-object values merge; a
 *  scalar/array replaces. Mirrors the server deep-merge shape (client-side, over the sparse patch only). */
function deepMergePatch(base: AppSettings, patch: AppSettings): AppSettings {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const baseValue = out[key];
    out[key] =
      value !== null && typeof value === "object" && !Array.isArray(value) && baseValue !== null && typeof baseValue === "object" && !Array.isArray(baseValue)
        ? deepMergePatch(baseValue as AppSettings, value as AppSettings)
        : value;
  }
  return out as AppSettings;
}
