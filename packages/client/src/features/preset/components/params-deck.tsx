// The PARAMS DECK (preset-surface-redesign.md §4) — the redesign's centerpiece and the Params view's whole
// body. ONE scrolling instrument column of kicker-separated clusters (QUALITY · SAMPLING · REASONING ·
// OUTPUT · CONTEXT · ADVANCED), replacing the four leaf tabs the Generation group used to hold.
//
// Still descriptor-driven: every sampling knob, effort level and verbosity level comes from
// `ModelCapability` via capability-panel-model.ts — never a hardcoded knob stack or a model-name match, and
// an unlisted knob is ABSENT, never a disabled slider. What CHANGED is the row grammar: the override
// Switch is gone (D4). A knob is a `KnobRow` — slider + editable mono twin — and an UNSET knob ghosts at
// its RESOLVED EFFECTIVE value with a provenance gloss, so the datum is never hidden (F2) and the funnel's
// own output is finally visible in the editor (F9).
//
// The effective profile is the SERVER'S (`preset.resolveEffective`, D5): this file re-derives no policy —
// no quality→axes mapping lives on the client (the drift `capability-panel-model.ts` bans).
//
// The deck is an instrument ISLAND inside the form-tier editor (§2 — the density law's sanctioned reverse
// nesting). OUTPUT/CONTEXT/ADVANCED live in params-limits.tsx (the component-size cap).

import type { EffortLevel, ModelCapability, Range } from "@orb/contracts/connection";
import type { PromptConfig, Quality } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Field, FieldLayout } from "@orb/ui/field";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack, Surface } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { pageStep, QUALITY_OPTIONS, reasoningControlFor, samplingKnobsFor, supportsSeed } from "../lib/capability-panel-model";
import type { EffectiveProfileRow } from "../lib/effective-knobs";
import { qualityMappingGloss, qualityOverrideGloss } from "../lib/effective-knobs";
import { THINKING_DISPLAY_ITEMS, thinkingDisplayLabel } from "../lib/preset-nav";
import { CapabilityGate } from "./capability-gate";
import { KnobRow } from "./knob-row";
import { ParamsLimits } from "./params-limits";

type AppForm = AppFormInstance<PromptConfig>;

export interface ParamsDeckProps {
  readonly form: AppForm;
  /** `undefined` when no chat connection resolves — QUALITY/CONTEXT/ADVANCED still render, the model-fed
   *  clusters show the connect-a-model note naming their knobs. */
  readonly capability: ModelCapability | undefined;
  /** The funnel projected for this preset (`preset.resolveEffective`) — `undefined` while it is
   *  unavailable (no chat model, or the read has not landed), which degrades to un-ghosted rows. */
  readonly effective: EffectiveProfileRow | undefined;
  /** The server-only BYOK passthrough's KEYS — a read-only presence row in ADVANCED (D7). */
  readonly customParameterKeys: readonly string[];
  /** The capability read's FAILURE message — `null` when the read simply resolved no model. The two are
   *  different problems (side-eye F-02) and the deck must not print the empty state over the error. */
  readonly capabilityError: string | null;
}

/** The staleness row's vocabulary (§4.2): every knob the effective read can report as STORED-BUT-DROPPED,
 *  with the WIRE name the row prints and the one write that unsets it. A closure per row rather than a
 *  computed `params.<knob>` path because the form path must stay a checked literal — a stale knob this
 *  build does not know is simply not cleared (never a blind write at a fabricated path). */
const STALE_KNOB_ROWS = [
  { knob: "temperature", wire: "temperature", clear: (f: AppForm): void => f.setFieldValue("params.temperature", undefined) },
  { knob: "topP", wire: "top_p", clear: (f: AppForm): void => f.setFieldValue("params.topP", undefined) },
  { knob: "topK", wire: "top_k", clear: (f: AppForm): void => f.setFieldValue("params.topK", undefined) },
  { knob: "minP", wire: "min_p", clear: (f: AppForm): void => f.setFieldValue("params.minP", undefined) },
  { knob: "topA", wire: "top_a", clear: (f: AppForm): void => f.setFieldValue("params.topA", undefined) },
  { knob: "frequencyPenalty", wire: "frequency_penalty", clear: (f: AppForm): void => f.setFieldValue("params.frequencyPenalty", undefined) },
  { knob: "presencePenalty", wire: "presence_penalty", clear: (f: AppForm): void => f.setFieldValue("params.presencePenalty", undefined) },
  { knob: "repetitionPenalty", wire: "repetition_penalty", clear: (f: AppForm): void => f.setFieldValue("params.repetitionPenalty", undefined) },
  { knob: "seed", wire: "seed", clear: (f: AppForm): void => f.setFieldValue("params.seed", undefined) },
  { knob: "effort", wire: "effort", clear: (f: AppForm): void => f.setFieldValue("params.effort", undefined) },
  { knob: "thinkingBudgetTokens", wire: "thinking_budget", clear: (f: AppForm): void => f.setFieldValue("params.thinkingBudgetTokens", undefined) },
  { knob: "thinkingDisplay", wire: "reasoning_display", clear: (f: AppForm): void => f.setFieldValue("params.thinkingDisplay", undefined) },
  { knob: "maxOutputTokens", wire: "max_output_tokens", clear: (f: AppForm): void => f.setFieldValue("params.maxOutputTokens", undefined) },
  { knob: "verbosity", wire: "verbosity", clear: (f: AppForm): void => f.setFieldValue("params.verbosity", undefined) },
] as const;

/** The wire name the staleness row prints for a knob (its own key when this build doesn't know it). */
function staleWireName(knob: string): string {
  return STALE_KNOB_ROWS.find((row) => row.knob === knob)?.wire ?? knob;
}

export function ParamsDeck({ form, capability, effective, customParameterKeys, capabilityError }: ParamsDeckProps): ReactElement {
  return (
    <Surface tier="instrument">
      <Stack gap="section">
        <QualityCluster effective={effective} form={form} />
        {/* ONE gate for the three model-fed clusters, never three copies of the same sentence (F-02). */}
        {capability === undefined ? (
          <CapabilityGate error={capabilityError} />
        ) : (
          <>
            <SamplingCluster capability={capability} effective={effective} form={form} />
            <ReasoningCluster capability={capability} effective={effective} form={form} />
          </>
        )}
        <ParamsLimits capability={capability} customParameterKeys={customParameterKeys} effective={effective} form={form} />
      </Stack>
    </Surface>
  );
}

/** QUALITY (§4 cluster 1) — the dial as ONE segmented row plus the SERVER-RESOLVED mapping gloss. */
function QualityCluster({ form, effective }: { readonly form: AppForm; readonly effective: EffectiveProfileRow | undefined }): ReactElement {
  return (
    <Section kicker="Quality" hint="The primary dial. It fills any knob you leave inherited below; anything you set explicitly wins over it.">
      <form.AppField name="params.quality">
        {(field): ReactElement => {
          const current = field.state.value as Quality | undefined;
          // TWO LINES, TWO JOBS (side-eye F-15): the MAPPING is the datum ("deep → effort high · temp
          // 1.0", the server's own projection of the dial table); the OVERRIDE note is status. Fusing them
          // is what made a fully-overridden dial print "everything is overridden" where the mock asks for
          // the mapping.
          const mapping = qualityMappingGloss(effective, current);
          const override = qualityOverrideGloss(effective);
          return (
            <Stack gap="tight">
              {/* RADIO, not a pressed-toggle group (ARIA rec 7): the dial is ONE-OF-N, and `aria-pressed`
                  on three buttons announces three independent toggles. The ARIA shape lives in the seal
                  (`Toggle`/`ToggleGroup` semantics), never hand-stamped here. */}
              <ToggleGroup
                aria-label="Quality"
                onValueChange={(next): void => field.handleChange(next[0] as Quality | undefined)}
                semantics="radio"
                value={current === undefined ? [] : [current]}
              >
                {QUALITY_OPTIONS.map((option) => (
                  <Toggle checked={current === option.value} key={option.value} semantics="radio" value={option.value}>
                    {option.label}
                  </Toggle>
                ))}
              </ToggleGroup>
              {mapping === null ? null : <Text voice="gloss">{mapping}</Text>}
              {override === null ? null : <Text voice="gloss">{override}</Text>}
            </Stack>
          );
        }}
      </form.AppField>
    </Section>
  );
}

/** SAMPLING (§4 cluster 2) — one KnobRow per capability-listed knob, the seed row, then the staleness row. */
function SamplingCluster({
  form,
  capability,
  effective,
}: {
  readonly form: AppForm;
  readonly capability: ModelCapability;
  readonly effective: EffectiveProfileRow | undefined;
}): ReactElement {
  const knobs = samplingKnobsFor(capability);
  if (knobs.length === 0 && !supportsSeed(capability)) {
    return (
      <Section kicker="Sampling">
        <Text voice="gloss">This model exposes no sampling controls.</Text>
      </Section>
    );
  }
  return (
    <Section kicker="Sampling">
      <form.Subscribe selector={(state): Quality | undefined => state.values.params.quality}>
        {(quality): ReactElement => (
          <Stack gap="tight">
            {knobs.map((knob) => (
              <KnobRow
                effective={effective?.knobs[knob.key]}
                form={form}
                hint={knob.description}
                key={knob.field}
                label={knob.label}
                max={knob.range.max}
                min={knob.range.min}
                name={knob.field}
                quality={quality}
                step={knob.step}
              />
            ))}
          </Stack>
        )}
      </form.Subscribe>
      {supportsSeed(capability) ? (
        <FieldLayout orientation="horizontal">
          <form.AppField name="params.seed">
            {(field): ReactElement => <field.NumberField hint="A fixed seed makes sampling reproducible." label="Seed" placeholder="random" />}
          </form.AppField>
        </FieldLayout>
      ) : null}
      <StalenessRow form={form} stale={effective?.stale ?? []} />
    </Section>
  );
}

/** The staleness row (§4.2, F7 dead) — stored explicit knobs the CURRENT model does not honor. They are
 *  dropped at the funnel and invisible in both directions until this row names them. Rendered only when
 *  non-empty; Keep dismisses for the session (a value legitimately waiting for a model that honors it —
 *  the D68 posture), Clear unsets the fields. */
function StalenessRow({
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

/** REASONING (§4 cluster 3) — the switch, the model's real effort levels or its budget KnobRow, the
 *  adaptive note, and `thinkingDisplay` RE-HOMED beside its own axis (F4: it lived two groups away, in the
 *  Prompt tab's "Message delivery" collapsible). */
function ReasoningCluster({
  form,
  capability,
  effective,
}: {
  readonly form: AppForm;
  readonly capability: ModelCapability;
  readonly effective: EffectiveProfileRow | undefined;
}): ReactElement {
  const control = reasoningControlFor(capability);
  if (!control.reasons) {
    return (
      <Section kicker="Reasoning">
        <Text voice="gloss">This model does not expose reasoning controls.</Text>
        <ThinkingDisplayField effective={effective} form={form} />
      </Section>
    );
  }
  return (
    <Section kicker="Reasoning">
      <FieldLayout orientation="horizontal">
        <form.AppField name="params.effort">
          {(field): ReactElement => {
            const effort = field.state.value as EffortLevel | "none" | undefined;
            const on = effort !== "none";
            return (
              <Stack gap="field">
                <Field label="Reasoning" name={field.name}>
                  <Switch aria-label="Enable reasoning" checked={on} onCheckedChange={(next): void => field.handleChange(next ? undefined : "none")} />
                </Field>
                {on && control.kind === "effort" ? <EffortField levels={control.effortLevels ?? []} onChange={field.handleChange} value={effort} /> : null}
              </Stack>
            );
          }}
        </form.AppField>
        {control.kind === "budget" && control.budgetRange !== undefined ? <BudgetKnob effective={effective} form={form} range={control.budgetRange} /> : null}
        {control.kind === "adaptive" ? (
          <Text voice="gloss">This model reasons adaptively — it self-budgets per turn, so there is no manual effort dial.</Text>
        ) : null}
        <ThinkingDisplayField effective={effective} form={form} />
      </FieldLayout>
    </Section>
  );
}

/** The thinking-budget knob — the same KnobRow grammar at the descriptor's own token range. */
function BudgetKnob({
  form,
  range,
  effective,
}: {
  readonly form: AppForm;
  readonly range: Range;
  readonly effective: EffectiveProfileRow | undefined;
}): ReactElement {
  return (
    <KnobRow
      effective={effective?.knobs["thinkingBudgetTokens"]}
      form={form}
      hint="Cap the tokens the model may spend reasoning before it answers."
      label="Thinking budget"
      largeStep={pageStep(range.min, range.max)}
      max={range.max}
      min={range.min}
      name="params.thinkingBudgetTokens"
      step={1}
    />
  );
}

/** Renders nothing when the descriptor lists no levels (an effort-mode model with an empty list). */
function EffortField({
  levels,
  value,
  onChange,
}: {
  readonly levels: readonly EffortLevel[];
  readonly value: EffortLevel | undefined;
  readonly onChange: (next: EffortLevel | undefined) => void;
}): ReactElement | null {
  if (levels.length === 0) {
    return null;
  }
  const items: SelectItems<string> = levels.map((level) => ({ value: level, label: level }));
  return (
    <Field label="Effort" name="reasoning-effort">
      <Select
        aria-label="Effort"
        items={items}
        onValueChange={(next): void => onChange(next === null || next === "" ? undefined : (next as EffortLevel))}
        placeholder="Model default"
        value={value ?? ""}
      />
    </Field>
  );
}

/** `params.thinkingDisplay` — re-homed from Prompt ▸ Message delivery (§3 map, F4). Unset GHOSTS the
 *  funnel's own resolved display mode rather than rendering an empty combobox (side-eye F-05); with no
 *  reading it says "model default" instead of inventing one. */
function ThinkingDisplayField({ form, effective }: { readonly form: AppForm; readonly effective: EffectiveProfileRow | undefined }): ReactElement {
  const resolved = effective?.knobs["thinkingDisplay"]?.value;
  return (
    <form.AppField name="params.thinkingDisplay">
      {(field): ReactElement => (
        <field.SelectField
          hint="How the model's reasoning is shown, when it reasons."
          items={THINKING_DISPLAY_ITEMS}
          label="Reasoning display"
          placeholder={resolved === undefined ? "Model default" : thinkingDisplayLabel(String(resolved))}
        />
      )}
    </form.AppField>
  );
}
