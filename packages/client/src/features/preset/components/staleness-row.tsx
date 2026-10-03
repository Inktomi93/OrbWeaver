// The params deck's staleness row (§4.2) — its own module for the component-size cap. It names the stored
// settings the target model does not honor; they stay stored (a preset is shared across connections) and
// are neither sent nor deleted unless the user presses Clear.

import { DEFAULT_SAMPLER_KEYS } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms/editor";
import { SAMPLING_KNOBS } from "../lib/capability-panel-model.ts";

type AppForm = AppFormInstance<PromptConfig>;

/** The staleness row's vocabulary (§4.2): every knob the effective read can report as STORED-BUT-DROPPED,
 *  with the WIRE name the row prints and the one write that unsets it. A closure per row rather than a
 *  fabricated path: sampling paths come from the checked catalog, and other paths remain literal. A stale knob this
 *  build does not know is simply not cleared (never a blind write at a fabricated path). */
const STALE_KNOB_ROWS = [
  ...SAMPLING_KNOBS.map((spec) => ({
    knob: spec.key,
    wire: spec.wire,
    clear: (f: AppForm): void => f.setFieldValue(spec.field, undefined),
  })),
  { knob: "seed", wire: "seed", clear: (f: AppForm): void => f.setFieldValue("params.seed", undefined) },
  { knob: "effort", wire: "effort", clear: (f: AppForm): void => f.setFieldValue("params.effort", undefined) },
  { knob: "thinkingBudgetTokens", wire: "thinking_budget", clear: (f: AppForm): void => f.setFieldValue("params.thinkingBudgetTokens", undefined) },
  { knob: "thinkingDisplay", wire: "reasoning_display", clear: (f: AppForm): void => f.setFieldValue("params.thinkingDisplay", undefined) },
  { knob: "maxOutputTokens", wire: "max_output_tokens", clear: (f: AppForm): void => f.setFieldValue("params.maxOutputTokens", undefined) },
  { knob: "verbosity", wire: "verbosity", clear: (f: AppForm): void => f.setFieldValue("params.verbosity", undefined) },
  { knob: "replyMedia", wire: "modalities", clear: (f: AppForm): void => f.setFieldValue("params.replyMedia", undefined) },
  { knob: "stop", wire: DEFAULT_SAMPLER_KEYS.stop, clear: (f: AppForm): void => f.setFieldValue("params.stop", undefined) },
  { knob: "logitBias", wire: DEFAULT_SAMPLER_KEYS.logitBias, clear: (f: AppForm): void => f.setFieldValue("params.logitBias", undefined) },
  {
    knob: "drySequenceBreakers",
    wire: DEFAULT_SAMPLER_KEYS.drySequenceBreakers,
    clear: (f: AppForm): void => f.setFieldValue("params.drySequenceBreakers", undefined),
  },
  { knob: "samplerOrder", wire: "sampler order", clear: (f: AppForm): void => f.setFieldValue("params.samplerOrder", undefined) },
] as const;

/** The wire name the staleness row prints for a knob (its own key when this build doesn't know it). */
function staleWireName(knob: string): string {
  return STALE_KNOB_ROWS.find((row) => row.knob === knob)?.wire ?? knob;
}

/** The staleness row (§4.2, F7 dead) — stored explicit knobs the CURRENT model does not honor. They are
 *  dropped at the funnel and invisible in both directions until this row names them. Rendered only when
 *  non-empty; Keep dismisses for the session (a value legitimately waiting for a model that honors it —
 *  the D68 posture), Clear unsets the fields. */
export function StalenessRow({
  form,
  stale,
}: {
  readonly form: AppForm;
  readonly stale: readonly { readonly knob: string; readonly value: number | string }[];
}): ReactElement | null {
  const [kept, setKept] = useState(false);
  if (kept || stale.length === 0) {
    return null;
  }
  const clear = (): void => {
    const listed = new Set(stale.map((entry) => entry.knob));
    for (const row of STALE_KNOB_ROWS) {
      if (listed.has(row.knob)) {
        row.clear(form);
      }
    }
  };
  return (
    // The rack's missing-pivot callout idiom, density-conformed: `rounded-base` (the ELEVATED `rounded-card`
    // step is D6-reserved) and the warning signal carried by the band + the glyph rather than by a `tone`
    // prop on Text (the four-voice grammar owns type color, §2).
    <Row align="center" className="rounded-base border border-warning bg-warning/10 text-warning" gap="field" padding="row">
      <Icon icon={AlertTriangle} size="sm" />
      <Text voice="label">Set but not honored by this model: {stale.map((entry) => `${staleWireName(entry.knob)} ${String(entry.value)}`).join(" · ")}</Text>
      <Button intent="ghost" onClick={(): void => setKept(true)} size="sm" type="button">
        Keep
      </Button>
      <Button intent="secondary" onClick={clear} size="sm" type="button">
        Clear
      </Button>
    </Row>
  );
}
