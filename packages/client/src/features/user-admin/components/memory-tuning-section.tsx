// The Memory tuning admin SECTION (Phase B ③) — the write-side memory config: AppSettings.memoryDefaults
// (the 11 recall/consolidation knobs) + AppSettings.memorySummarizer (the digest-summarize sampling). Both
// are admin-tier b-nature overrides: each field shows its deployment floor and whether it's an active
// override; a section-level Reset clears the whole nested override to the floor (the merge-safe
// `{ <key>: null }`). Numeric knobs batch a Save; the mode enum + keywordMatch boolean write immediately.
// Reads getAppSettingsWithOverrides for the honest floor-vs-override story.
//
// A settings-SECTION CONTRIBUTION (§6c) at the `admin` anchor, owned by user-admin (admin-tier config).

import { MEMORY_RETRIEVAL_MODES } from "@orb/contracts/search";
import type { MemoryDefaults, MemoryDefaultsBoundKey, ResolvedMemoryDefaults } from "@orb/contracts/settings";
import {
  clampMemoryDefault,
  clampMemorySummarizerMaxTokens,
  DEFAULT_MEMORY_DEFAULTS,
  DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS,
  MEMORY_DEFAULTS_BOUNDS,
} from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import type { SaveLifecycleState } from "#state";
import { settingsAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations";
import { anyFieldOverridden, isOverridden } from "../lib/app-override-model";
import { MEMORY_TUNING_SUBCATEGORY } from "../lib/memory-tuning-nav";
import { AdminOverrideField, AdminOverrideResetRow, AdminOverrideSelect, AdminOverrideSwitch } from "./admin-override-field";

// The numeric memoryDefaults knobs — each a MemoryDefaults field with a floor in DEFAULT_MEMORY_DEFAULTS.
const NUMERIC_KNOBS = [
  { key: "blockSize", label: "Block size", hint: "Messages per tier-0 digest block (≈3k tok, under the 8192 cap).", step: 1 },
  { key: "verbatimWindow", label: "Verbatim window", hint: "Recent messages never digested — the protect zone.", step: 1 },
  { key: "queryWindow", label: "Query window", hint: "Recent messages used as the retrieval query (mixB/mixC).", step: 1 },
  { key: "fanOut", label: "Fan-out", hint: "Tier-k digests consolidated into one tier-(k+1) digest.", step: 1 },
  { key: "maxTier", label: "Max tier", hint: "Max consolidation depth; 0 = tier-0 only.", step: 1 },
  { key: "retrieveK", label: "Retrieve K", hint: "Vector candidate pool size (mixB/mixC).", step: 1 },
  { key: "rerankTo", label: "Rerank to", hint: "Digests kept after cross-encoder rerank (mixC).", step: 1 },
  { key: "minScore", label: "Min score", hint: "Minimum cosine similarity for a retrieved digest.", step: 0.05 },
  { key: "recencyBias", label: "Recency bias", hint: "Mild score boost toward recent digests (0 = off).", step: 0.05 },
] as const satisfies readonly { key: MemoryDefaultsBoundKey; label: string; hint: string; step: number }[];

const MODE_ITEMS: SelectItems<string> = MEMORY_RETRIEVAL_MODES.map((m) => ({ value: m, label: m }));

type NumericDraft = Record<string, string>;

function toNumericDraft(effective: ResolvedMemoryDefaults): NumericDraft {
  const out: NumericDraft = {};
  for (const { key } of NUMERIC_KNOBS) {
    out[key] = String(effective[key]);
  }
  return out;
}

/** The only-moved memoryDefaults numeric delta: each draft value CLAMPED to its schema bounds (so an
 *  out-of-range input never reaches the write path and trips the silent-wipe `.catch`), included only when it
 *  differs from the effective baseline. A non-finite draft clamps to `null` → dropped. */
function diffNumeric(effective: ResolvedMemoryDefaults, draft: NumericDraft): MemoryDefaults {
  const patch: Record<string, number> = {};
  for (const { key } of NUMERIC_KNOBS) {
    const clamped = clampMemoryDefault(key, Number(draft[key]));
    if (clamped !== null && clamped !== effective[key]) {
      patch[key] = clamped;
    }
  }
  return patch as MemoryDefaults;
}

/** The mutation's lifecycle as the settings save-status seam's three states (SET-SEAMS §3): a section with
 *  its own save affordance still REPORTS, so the shell's aggregate footer + the nav marker see its failure. */
function saveStateOf(isPending: boolean, errored: boolean): SaveLifecycleState {
  if (errored) {
    return "error";
  }
  return isPending ? "saving" : "saved";
}

/** The section's own suspense/error boundary so it is self-contained. */
export function MemoryTuningSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading memory tuning…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="memory tuning — administrators only" onRetry={retry} />}
    >
      <MemoryTuningBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function MemoryTuningBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const save = useUpdateAppOverrides({ trpc, invalidation });

  const stored = data.overrides.memoryDefaults ?? null;
  const summarizerStored = data.overrides.memorySummarizer ?? null;
  // The effective memoryDefaults baseline = the floor ⊕ stored override (per field), every knob present.
  const effective: ResolvedMemoryDefaults = { ...DEFAULT_MEMORY_DEFAULTS, ...(stored ?? {}) };
  const [draft, setDraft] = useState<NumericDraft>(() => toNumericDraft(effective));

  const patch = diffNumeric(effective, draft);
  const dirty = Object.keys(patch).length > 0;
  const anyDefaultsOverridden = anyFieldOverridden(stored);
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  // memoryDefaults writes MERGE over the currently-stored overrides so untouched knobs survive; the enum +
  // boolean write immediately, the numeric knobs via Save. Reset clears the whole nested override.
  const writeMemoryDefaults = (delta: MemoryDefaults): void => {
    save.mutateAsync({ partial: { memoryDefaults: { ...(stored ?? {}), ...delta } } }).catch(() => undefined);
  };
  const resetMemoryDefaults = (): void => {
    // Re-sync the local draft to the floor so the input VALUE flips to the default alongside the "Using the
    // deployment default" copy — otherwise the input keeps the stale typed value (side-eye P2: a visible
    // contradiction). `useState` runs its initializer once, so the post-reset refetch alone never updates it.
    setDraft(toNumericDraft(DEFAULT_MEMORY_DEFAULTS));
    save.mutateAsync({ partial: { memoryDefaults: null } }).catch(() => undefined);
  };

  // memorySummarizer maxTokens (numeric override; temperature floor is the provider default, shown as such).
  const summarizerOverridden = isOverridden(summarizerStored?.maxTokens);
  const summarizerMaxTokens = summarizerStored?.maxTokens ?? DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS;
  const [summarizerDraft, setSummarizerDraft] = useState<string>(() => String(summarizerMaxTokens));
  // The clamped value the Save would write — Save is enabled only when it CLAMPS to something different (a
  // non-finite/blank draft clamps to null → Save stays disabled, never sending a wipe-triggering value).
  const summarizerClamped = clampMemorySummarizerMaxTokens(Number(summarizerDraft));
  const summarizerDirty = summarizerClamped !== null && summarizerClamped !== summarizerMaxTokens;

  const saveSummarizer = (): void => {
    if (summarizerClamped === null) {
      return;
    }
    save.mutateAsync({ partial: { memorySummarizer: { ...(summarizerStored ?? {}), maxTokens: summarizerClamped } } }).catch(() => undefined);
  };
  const resetSummarizer = (): void => {
    setSummarizerDraft(String(DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS)); // re-sync the draft to the floor (side-eye P2)
    save.mutateAsync({ partial: { memorySummarizer: null } }).catch(() => undefined);
  };

  return (
    <Section divider={true} heading={MEMORY_TUNING_SUBCATEGORY.label} id={settingsAnchorId("admin", MEMORY_TUNING_SUBCATEGORY.id)}>
      <Stack gap="section">
        <Stack gap="field">
          <Text size="label" tone="muted">
            Recall &amp; consolidation (memoryDefaults). Absent knobs run on the grounded deployment floor.
          </Text>
          <AdminOverrideSelect
            label="Retrieval mode"
            hint="off | mixA (chronological) | mixB (+vector) | mixC (+rerank) | tiered."
            value={effective.mode}
            items={MODE_ITEMS}
            overridden={isOverridden(stored?.mode)}
            floorLabel={DEFAULT_MEMORY_DEFAULTS.mode}
            onSet={(next): void => writeMemoryDefaults({ mode: next as MemoryDefaults["mode"] })}
          />
          <AdminOverrideSwitch
            label="Keyword match"
            hint="Also match digest keywords whole-word against recent messages."
            value={effective.keywordMatch}
            overridden={isOverridden(stored?.keywordMatch)}
            floorLabel={DEFAULT_MEMORY_DEFAULTS.keywordMatch ? "on" : "off"}
            onSet={(next): void => writeMemoryDefaults({ keywordMatch: next })}
          />
          {NUMERIC_KNOBS.map(({ key, label, hint, step }) => (
            <AdminOverrideField
              key={key}
              label={label}
              hint={hint}
              value={draft[key] ?? ""}
              onChange={(next): void => setDraft((d) => ({ ...d, [key]: next }))}
              overridden={isOverridden(stored?.[key])}
              floorValue={DEFAULT_MEMORY_DEFAULTS[key]}
              min={MEMORY_DEFAULTS_BOUNDS[key].min}
              {...(MEMORY_DEFAULTS_BOUNDS[key].max === null ? {} : { max: MEMORY_DEFAULTS_BOUNDS[key].max })}
              step={step}
            />
          ))}
          <AdminOverrideResetRow
            dirty={dirty}
            anyOverridden={anyDefaultsOverridden}
            saving={save.isPending}
            errored={save.error !== null}
            onSave={(): void => writeMemoryDefaults(patch)}
            onReset={resetMemoryDefaults}
          />
        </Stack>

        <Stack gap="field">
          <Text size="label" tone="muted">
            Digest summarizer sampling (memorySummarizer). Temperature unset = the summarizer provider default.
          </Text>
          <AdminOverrideField
            label="Summarize max tokens"
            hint="Output-token reserve for each digest-summarize call."
            value={summarizerDraft}
            onChange={setSummarizerDraft}
            overridden={summarizerOverridden}
            floorValue={DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS}
            min={1}
            step={64}
          />
          <AdminOverrideResetRow
            dirty={summarizerDirty}
            anyOverridden={anyFieldOverridden(summarizerStored)}
            saving={save.isPending}
            errored={save.error !== null}
            onSave={saveSummarizer}
            onReset={resetSummarizer}
          />
        </Stack>
      </Stack>
    </Section>
  );
}
