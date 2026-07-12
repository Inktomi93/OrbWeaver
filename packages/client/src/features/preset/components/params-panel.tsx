// The DESCRIPTOR-DRIVEN params panel (W10 Panel 2 · capability-turn-shaping/04 §W10 + the deferred
// connection-capability-panel.md). It RENDERS FROM `ModelCapabilityView` — iterating `capability.sampling`
// (a knob shows ONLY where the descriptor lists it, slider bounds from each knob's `Range`), the reasoning
// control (off-toggle + the model's ACTUAL `effortLevels` / a `budgetRange` slider / an adaptive note),
// and `verbosity` (only when present). NO hardcoded knob stack, NO model-name string-match.
//
// THE GATE (owner-ruled — connection-capability-panel.md Proposal 1): this component derives EVERY knob it
// renders from the capability descriptor via capability-panel-model.ts, whose only knob-vocabulary import
// is `@orb/contracts`. A static knob list from outside `@orb/contracts`, or a `model.includes(...)` branch,
// is a design failure. The params panel here imports NO knob list — it iterates `samplingKnobsFor` /
// `reasoningControlFor` / `verbosityLevelsFor` off the passed `ModelCapability`.
//
// OPTIONAL-KNOB BINDING: a `PromptConfig.params.<knob>` is OPTIONAL (absent ⇒ "use the model default").
// A slider needs a concrete number, so each numeric knob renders as an OVERRIDE SWITCH (is this knob set?)
// gating a slider — off ⇒ the param is `undefined` (round-trips to unset, the ST neutralized-sentinel
// discipline); on ⇒ the slider value persists. This keeps the direct-bind honest (an untouched knob never
// mints a value) without a flat-form shadow. `enabling` seeds the slider to the Range MIDPOINT.

import type { EffortLevel, ModelCapability, Range, Verbosity } from "@orb/contracts/connection";
import type { PromptConfig, Quality } from "@orb/contracts/preset";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import type { ResolvedSamplingKnob } from "../lib/capability-panel-model";
import {
  QUALITY_OPTIONS,
  reasoningControlFor,
  samplingKnobsFor,
  supportsSeed,
  verbosityLevelsFor,
} from "../lib/capability-panel-model";

/** The preset editor's form instance — its value shape is the nested `PromptConfig` (direct-bind). Threaded
 *  from the editor surface; the panel binds nested paths (`params.temperature`, `params.effort`, …). */
type AppForm = AppFormInstance<PromptConfig>;

interface ParamsPanelProps {
  readonly form: AppForm;
  /** The resolved capability for the preset's target model — the panel iterates it. `undefined` when no
   *  chat connection is configured: Quality still renders (it derives nothing from the descriptor), the
   *  descriptor-driven axes show the "connect a chat model" note. */
  readonly capability: ModelCapability | undefined;
  /** Which axis this panel instance renders (the editor tabs mount one panel per params tab). */
  readonly axis: "quality" | "sampling" | "reasoning" | "output";
}

/** The descriptor-driven params panel — renders the requested `axis` off the capability. */
export function ParamsPanel({ form, capability, axis }: ParamsPanelProps): ReactElement {
  // Quality is the PRIMARY control (~95% of presets) and derives NOTHING from the descriptor — the gate
  // lives HERE (not in the surface) so it renders even with no chat model connected (first-run); the other
  // axes render FROM the descriptor, so with no connection they show the connect-a-model note below.
  if (axis === "quality") {
    return <QualityDial form={form} />;
  }
  if (capability === undefined) {
    return (
      <Section heading="Model parameters">
        <Text tone="muted">
          Connect a chat model in Connections to tune sampling, reasoning, and output — these
          controls show only the knobs your model honors.
        </Text>
      </Section>
    );
  }
  if (axis === "sampling") {
    return <SamplingSection form={form} capability={capability} />;
  }
  if (axis === "reasoning") {
    return <ReasoningSection form={form} capability={capability} />;
  }
  return <OutputSection form={form} capability={capability} />;
}

// ── The QUALITY dial (the PRIMARY control — ~95% of presets) ────────────────────────────────────────

function QualityDial({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <Section heading="Quality">
      <Text size="micro" tone="muted">
        The primary dial — the resolver maps it onto this model's reasoning and sampling. Fine-tune
        the raw knobs in the other tabs.
      </Text>
      <form.AppField name="params.quality">
        {(field): ReactElement => {
          // The `@orb/ui` RadioGroup owns the radiogroup/radio ARIA + keyboard (a feature must not hand-roll
          // interactive roles — the no-interactive-role-in-features gate). Empty string ⇒ no override.
          const current = (field.state.value as Quality | undefined) ?? "";
          return (
            <RadioGroup
              value={current}
              onValueChange={(next): void =>
                field.handleChange(next === "" ? undefined : (next as Quality))
              }
              aria-label="Quality"
            >
              <Stack gap="field">
                {QUALITY_OPTIONS.map((option) => (
                  <RadioGroupItem key={option.value} value={option.value}>
                    {option.label} — {option.description}
                  </RadioGroupItem>
                ))}
              </Stack>
            </RadioGroup>
          );
        }}
      </form.AppField>
    </Section>
  );
}

// ── The SAMPLING section (iterated from `capability.sampling`) ──────────────────────────────────────

function SamplingSection({
  form,
  capability,
}: {
  readonly form: AppForm;
  readonly capability: ModelCapability;
}): ReactElement {
  const knobs = samplingKnobsFor(capability);
  // A model with `sampling: {}` (agent-sdk Claude) yields NO knobs → the panel shows no sampling section
  // (no disabled-slider theater — the GATE's "a knob shows ONLY where the descriptor lists it").
  if (knobs.length === 0 && !supportsSeed(capability)) {
    return (
      <Section heading="Sampling">
        <Text tone="muted">This model exposes no sampling controls.</Text>
      </Section>
    );
  }
  return (
    <Section heading="Sampling">
      <Text size="micro" tone="muted">
        Only the knobs this model honors are shown. A knob left off uses the model's default.
      </Text>
      <Stack gap="block">
        {knobs.map((knob) => (
          <OptionalKnobRow key={knob.field} form={form} knob={knob} />
        ))}
        {supportsSeed(capability) ? (
          <form.AppField name="params.seed">
            {(field): ReactElement => (
              <field.NumberField
                label="Seed"
                description="A fixed seed for reproducible sampling (leave blank for random)."
              />
            )}
          </form.AppField>
        ) : null}
      </Stack>
    </Section>
  );
}

/** One optional numeric sampling knob — an override switch gating a bounded slider. Off ⇒ the param is
 *  `undefined` (unset); on ⇒ the slider value (seeded to the Range midpoint when first enabled). The
 *  knob's `field` is a typed `params.*` literal, so `form.AppField name` type-checks. */
function OptionalKnobRow({
  form,
  knob,
}: {
  readonly form: AppForm;
  readonly knob: ResolvedSamplingKnob;
}): ReactElement {
  const { label, description, range, step } = knob;
  const midpoint = rangeMidpoint(range, step);
  return (
    <form.AppField name={knob.field}>
      {(field): ReactElement => {
        const value = field.state.value as number | undefined;
        const enabled = value !== undefined;
        return (
          <Field label={label} description={description} name={field.name}>
            <Row gap="field" align="center" className="flex-wrap">
              <Switch
                checked={enabled}
                onCheckedChange={(next): void => field.handleChange(next ? midpoint : undefined)}
                aria-label={`Override ${label}`}
              />
              {enabled ? (
                <Slider
                  value={value}
                  onValueChange={(next): void => field.handleChange(next)}
                  min={range.min}
                  max={range.max}
                  step={step}
                  showValue={true}
                  className="min-w-0 flex-1"
                />
              ) : (
                <Text size="micro" tone="muted">
                  Using the model default.
                </Text>
              )}
            </Row>
          </Field>
        );
      }}
    </form.AppField>
  );
}

/** The Range midpoint, snapped to the knob's step (the seed when a knob is first enabled). */
function rangeMidpoint(range: Range, step: number): number {
  const mid = (range.min + range.max) / 2;
  if (step >= 1) {
    return Math.round(mid);
  }
  // Snap to the step grid so the seeded value is a clean slider position.
  return Math.round(mid / step) * step;
}

// ── The REASONING section (keyed by `reasoning.mode`) ───────────────────────────────────────────────

function ReasoningSection({
  form,
  capability,
}: {
  readonly form: AppForm;
  readonly capability: ModelCapability;
}): ReactElement {
  const control = reasoningControlFor(capability);
  if (!control.reasons) {
    return (
      <Section heading="Reasoning">
        <Text tone="muted">This model does not expose reasoning controls.</Text>
      </Section>
    );
  }
  return (
    <Section heading="Reasoning">
      {/* The OFF-toggle — `params.effort === 'none'` is the off value (the user-intent EFFORT_LEVELS carries
          `'none'`; the model-side does not). Distinct axis from the effort/budget dial below. */}
      <form.AppField name="params.effort">
        {(field): ReactElement => {
          const effort = field.state.value as EffortLevel | "none" | undefined;
          const on = effort !== "none";
          return (
            <Stack gap="block">
              <Field label="Reasoning" name={field.name}>
                <Switch
                  checked={on}
                  onCheckedChange={(next): void => field.handleChange(next ? undefined : "none")}
                  aria-label="Enable reasoning"
                />
              </Field>
              {on && control.kind === "effort" ? (
                <EffortDropdown
                  levels={control.effortLevels ?? []}
                  value={effort === undefined ? undefined : (effort as EffortLevel)}
                  onChange={(next): void => field.handleChange(next)}
                />
              ) : null}
            </Stack>
          );
        }}
      </form.AppField>

      {control.kind === "budget" && control.budgetRange !== undefined ? (
        <BudgetSlider form={form} range={control.budgetRange} />
      ) : null}

      {control.kind === "adaptive" ? (
        <Text size="micro" tone="muted">
          This model reasons adaptively — it self-budgets per turn, so there is no manual effort
          dial.
        </Text>
      ) : null}
    </Section>
  );
}

/** The effort dropdown — the model's ACTUAL levels only (never the full enum). Renders nothing when the
 *  descriptor lists no levels (the off-toggle above still stands). */
function EffortDropdown({
  levels,
  value,
  onChange,
}: {
  readonly levels: readonly EffortLevel[];
  readonly value: EffortLevel | undefined;
  readonly onChange: (next: EffortLevel) => void;
}): ReactElement | null {
  if (levels.length === 0) {
    return null;
  }
  const items: SelectItems<string> = levels.map((level) => ({ value: level, label: level }));
  return (
    <Field label="Effort" name="reasoning-effort">
      <EffortSelect items={items} value={value} onChange={onChange} />
    </Field>
  );
}

// A thin Select wrapper (the panel is not a bound-field factory — it composes the raw Select against the
// AppField value). The Select is imported lazily here to keep the sampling path free of it.
function EffortSelect({
  items,
  value,
  onChange,
}: {
  readonly items: SelectItems<string>;
  readonly value: EffortLevel | undefined;
  readonly onChange: (next: EffortLevel) => void;
}): ReactElement {
  return (
    <PanelSelect
      items={items}
      value={value ?? ""}
      onChange={(next): void => onChange(next as EffortLevel)}
      placeholder="Model default"
      ariaLabel="Effort"
    />
  );
}

function BudgetSlider({
  form,
  range,
}: {
  readonly form: AppForm;
  readonly range: Range;
}): ReactElement {
  return (
    <form.AppField name="params.thinkingBudgetTokens">
      {(field): ReactElement => {
        const value = field.state.value as number | undefined;
        const enabled = value !== undefined;
        const seed = Math.round((range.min + range.max) / 2);
        return (
          <Field
            label="Thinking budget (tokens)"
            description="Cap the tokens the model may spend reasoning."
            name={field.name}
          >
            <Row gap="field" align="center" className="flex-wrap">
              <Switch
                checked={enabled}
                onCheckedChange={(next): void => field.handleChange(next ? seed : undefined)}
                aria-label="Override thinking budget"
              />
              {enabled ? (
                <Slider
                  value={value}
                  onValueChange={(next): void => field.handleChange(next)}
                  min={range.min}
                  max={range.max}
                  step={1}
                  showValue={true}
                  className="min-w-0 flex-1"
                />
              ) : (
                <Text size="micro" tone="muted">
                  Using the model default.
                </Text>
              )}
            </Row>
          </Field>
        );
      }}
    </form.AppField>
  );
}

// ── The OUTPUT section (verbosity + max-output; verbosity only when present) ────────────────────────

function OutputSection({
  form,
  capability,
}: {
  readonly form: AppForm;
  readonly capability: ModelCapability;
}): ReactElement {
  const verbosityLevels = verbosityLevelsFor(capability);
  return (
    <Section heading="Output">
      <form.AppField name="params.maxOutputTokens">
        {(field): ReactElement => (
          <field.NumberField
            label="Max output tokens"
            description="Cap the length of the reply (leave blank for the model default)."
          />
        )}
      </form.AppField>
      {verbosityLevels !== undefined ? (
        <form.AppField name="params.verbosity">
          {(field): ReactElement => {
            const value = field.state.value as Verbosity | undefined;
            const items: SelectItems<string> = verbosityLevels.map((level) => ({
              value: level,
              label: level,
            }));
            return (
              <Field
                label="Verbosity"
                description="How terse or expansive the model's replies run."
                name={field.name}
              >
                <PanelSelect
                  items={items}
                  value={value ?? ""}
                  onChange={(next): void =>
                    field.handleChange(next === "" ? undefined : (next as Verbosity))
                  }
                  placeholder="Model default"
                  ariaLabel="Verbosity"
                />
              </Field>
            );
          }}
        </form.AppField>
      ) : null}
    </Section>
  );
}

// A minimal single-select wrapper over `@orb/ui/select` for the panel's descriptor-derived pickers (the
// bound `SelectField` factory can't express the "empty = unset" option cleanly for an optional enum). The
// panel composes the raw Select primitive — still compose-only.
function PanelSelect({
  items,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  readonly items: SelectItems<string>;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder: string;
  /** The control's accessible name — the wrapping `<Field>` label isn't associated to the radix Select
   *  trigger, so the trigger carries it directly (`jsx-a11y/control-has-associated-label`). */
  readonly ariaLabel: string;
}): ReactElement {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next): void => onChange(next ?? "")}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}
