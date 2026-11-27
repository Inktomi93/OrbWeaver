// The PARAMS DECK — the redesign's centerpiece and the Params view's whole
// body. ONE scrolling instrument column of kicker-separated clusters (QUALITY · SAMPLING · REASONING ·
// OUTPUT · CONTEXT · ADVANCED), replacing the four leaf tabs the Generation group used to hold.
//
// ONE TYPE SCALE, ONE CONTROL GRAMMAR (crunch-list 4/9/21, owner rulings 2026-08-02). The deck speaks four
// voices and no fifth: `kicker` (cluster names) · `label` (knob names, incl. every Field label) · the
// control's own value step · `gloss` (every helper line). Explanatory prose rides the hover hint, never a
// Field `description` — that slot renders a second, louder helper step. Controls: amber-ON switches and
// amber-fill explicit sliders (the app's one control color grammar), and numbers print RAW (KnobRow's
// `KNOB_NUMBER_FORMAT`), never locale-grouped.
//
// Still descriptor-driven: every sampling knob, effort level and verbosity level comes from
// `GenerationCapability` via capability-panel-model.ts — never a hardcoded knob stack or a model-name match.
// A control the Chat connection's model cannot apply is NOT RENDERED (D68): no disabled slider, no "not honored"
// list, and a cluster with nothing left disappears without an empty-state line. A stored value for a hidden
// control stays stored and unsent, so switching to a model that takes it brings it back.
//
// NO MODEL KNOWN: every model-fed control (quality, sampling, reasoning, output, advanced) needs a descriptor to
// say it applies, so with no Chat connection none renders; the boundary's no-model notice with its Connections
// door stands in their place. Context is Orbweaver's own and renders without one.
//
// The row grammar: the override Switch is gone (D4). A knob is a `KnobRow` — slider + editable mono twin — and an UNSET knob ghosts at
// its RESOLVED EFFECTIVE value with a provenance gloss, so the datum is never hidden (F2) and the funnel's
// own output is finally visible in the editor (F9).
//
// The effective profile is the SERVER'S (`preset.resolveEffective`, D5): this file re-derives no policy —
// no quality→axes mapping lives on the client (the drift `capability-panel-model.ts` bans).
//
// The deck is an instrument ISLAND inside the form-tier editor (§2 — the density law's sanctioned reverse
// nesting). OUTPUT/CONTEXT/ADVANCED live in params-limits.tsx.
//
// EVERY NON-KNOB ROW IS A SHARED-TRACK ROW (#1770). The deck's `<Field>` rows used to sit in
// `FieldLayout orientation="horizontal"`'s DEFAULT `block` arm — a flex `justify-between` against the pane
// with a `w-(--width-control-col)` dock — so the distance from a name to its control was whatever the
// window happened to be: `design-audit` filed five `row-void`s on this tab at 46-57% of a 544px row
// (Quality · Seed · Reasoning · Effort · Verbatim tail), and the gap GREW with the pane (452px at 720,
// 476px at 1520, with the control's x moving with it). They are `SettingRowGroup` + `SettingTrackRow` now
// (#932's ratified answer): the label track is `--width-control-col`, so every control on the deck starts
// at ONE x that does not move — measured identical at 560/720/1120/1520 and stacked below the group's own
// step. A knob row is NOT one of these: its control is a flexing rail, which is `KnobGrid`'s own track set
// (`--width-label-col`), and the two tokens are deliberately different widths (see their descriptions).

import type { EffortLevel, GenerationCapability, Range } from "@orb/contracts/inference";
import { statesKnob } from "@orb/contracts/inference";
import type { Quality, ThinkingDisplay } from "@orb/contracts/preset";
import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { EditorPage, QueryBoundary, SettingRowGroup, SettingTrackRow } from "#components";
import { useSuspenseQuery, useTRPC } from "#data";
import type { AppFormInstance } from "#forms/editor";
import {
  budgetRangeFor,
  effortLevelsFor,
  pageStep,
  QUALITY_SELECT_ITEMS,
  qualityFromSelect,
  qualitySelectValue,
  samplerStagesFor,
  samplingKnobsFor,
} from "../lib/capability-panel-model.ts";
import { chatCapabilityOf } from "../lib/chat-capability.ts";
import type { EffectiveProfileRow } from "../lib/effective-knobs.ts";
import { MIROSTAT_SKIPPED_GLOSS, mirostatSkipped, qualityDeckGloss } from "../lib/effective-knobs.ts";
import type { PresetEditorValues } from "../lib/preset-editor-values.ts";
import { PRESET_QUALITY_LABEL } from "../lib/preset-names.ts";
import { thinkingDisplayItems, thinkingDisplayLabel } from "../lib/preset-nav.ts";
import { SAMPLING_FLAG_LABELS } from "../lib/sampling-knob-catalog.ts";
import { CapabilityGate, CapabilityGatePending } from "./capability-gate.tsx";
import { KnobGrid, KnobRow } from "./knob-row.tsx";
import type { ParamsLimitsProps } from "./params-limits.tsx";
import { ParamsLimits } from "./params-limits.tsx";
import { SamplerOrder } from "./sampler-order.tsx";
import { DrySequenceBreakers } from "./sequence-chips.tsx";

type AppForm = AppFormInstance<PresetEditorValues>;

/** A knob row whose slider moves in whole steps — it also pages by a range-sized step. */
const INTEGER_STEP = 1;

export function ParamsDeck({ form, capability, chatConnectionId, chatWire, effective }: ParamsLimitsProps): ReactElement {
  return (
    <>
      {/* THE DECK HAS ITS OWN MEASURE CAP (side-eye 2026-08-19 P2). The editor's content column BREATHES to
          `--width-content-col-wide` (896px) once the pane clears @cq-64 — right for prose and for the rack,
          wrong for an instrument: every surplus pixel goes into the knob TRACK, because the track is the
          row's only flexing cell. Measured at a 1224px pane: 595px of rail for a 0-2 temperature, i.e. ~300px
          per unit of a dial whose useful precision is 0.05 — a slider that got harder to aim as the window
          got bigger. The cap is `--width-content-col` (720px, the token whose own description IS this
          measure), and it is CENTERED inside the breathing column so the surplus is a symmetric margin
          rather than a one-sided void. Nothing else moves: the label cell, the numeric twin and the reset are
          fixed-width by token, so capping the row caps exactly the cell that was over-growing.

          THIS IS THE TOKEN'S ONE RATIFIED EXCEPTION, AND IT HAS NOW BEEN AUDITED AS ONE (#1682, refused).
          `--width-content-col` has eight consumers; #1664 gave seven of them the token's full stated
          consumption (`mx-auto w-full max-w-(--width-content-col) @cq-64:max-w-(--width-content-col-wide)`),
          and a count over the remaining spellings read this site as the eighth oversight. It is not: an
          INSTRUMENT whose only flexing cell is a control track holds the cap and does NOT breathe, which is
          the 2026-08-19 ruling above. Measured again when the audit landed, by planting the briefed change
          here: the knob row went 720px → 896px, i.e. straight back into the over-grown rail that ruling
          exists to prevent. The
          deck is centered (`mx-auto w-full`) precisely so it sits symmetrically inside the column that DOES
          breathe around it. */}
      <EditorPage gap="section" kind="instrument">
        {/* ONE gate for the model-fed clusters, never three copies of the same sentence (F-02). Its arms are
            PENDING (a skeleton) and FAILED (the server's message) — see the gate's header for why those two
            are exhaustive and why the old connect-a-model empty state was a flash, not a state. */}
        <QueryBoundary
          resetKeys={[]}
          fallback={<CapabilityGatePending />}
          renderError={(error, retry): ReactElement => <CapabilityGate error={error} onRetry={retry} />}
        >
          <ModelFedClusters effective={effective} form={form} />
        </QueryBoundary>
        <ParamsLimits capability={capability} chatConnectionId={chatConnectionId} chatWire={chatWire} effective={effective} form={form} />
      </EditorPage>
    </>
  );
}

/** QUALITY, SAMPLING and REASONING, which need the chat model's descriptor. A settled resolve that describes no
 *  generation model has nothing for them to show, so it keeps the pending skeleton rather than claiming an empty
 *  model. */
function ModelFedClusters({ form, effective }: { readonly form: AppForm; readonly effective: EffectiveProfileRow | undefined }): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.connection.resolveChatCapability.queryOptions());
  const capability = chatCapabilityOf(data);
  if (capability === undefined) {
    return <CapabilityGatePending />;
  }
  return (
    <>
      {statesKnob(capability, "quality") ? <QualityCluster effective={effective} form={form} /> : null}
      <SamplingCluster capability={capability} effective={effective} form={form} />
      <ReasoningCluster capability={capability} effective={effective} form={form} />
    </>
  );
}

/** QUALITY (§4 cluster 1) — the dial as ONE dropdown row plus the SERVER-RESOLVED mapping gloss.
 *
 *  THE STRIP IS DEAD (owner ruling O-18). The segmented `ToggleGroup` was three 15px cells that nothing
 *  else on the deck spoke — two of its own type tuples in the Params typography census — and it had no
 *  honest OFF affordance: "no dial" was reachable only by clicking the selected cell again. It is now the
 *  same `Field` + `Select` grammar as Effort / Reasoning display / Verbosity (which is also what "the strip
 *  is on the wrong side" resolves to: the control docks in the row's control column like every other one),
 *  with "Don't use quality" as a first-class option. That arm STORES AS THE ABSENCE of `params.quality` —
 *  see `qualitySelectValue`'s header; it is a named arm, not a fourth enum member. */
function QualityCluster({ form, effective }: { readonly form: AppForm; readonly effective: EffectiveProfileRow | undefined }): ReactElement {
  return (
    <Section kicker={PRESET_QUALITY_LABEL}>
      <form.AppField name="params.quality">
        {(field): ReactElement => {
          const current = field.state.value;
          // ONE LINE (crunch-list 5): the MAPPING datum ("deep → effort high · temperature 1", the
          // server's own projection of the dial table) joined with the OVERRIDE status, exactly as the
          // mock draws it. Both halves stay separate derivations in `effective-knobs.ts`.
          const gloss = qualityDeckGloss(effective, current);
          return (
            <Stack gap="tight">
              <SettingRowGroup>
                <SettingTrackRow>
                  <Field
                    hint="The primary dial. It fills any knob you leave inherited below; anything you set explicitly wins over it."
                    label={PRESET_QUALITY_LABEL}
                    name={field.name}
                  >
                    <Select
                      aria-label={PRESET_QUALITY_LABEL}
                      items={QUALITY_SELECT_ITEMS}
                      onValueChange={(next): void => field.handleChange(qualityFromSelect(next))}
                      value={qualitySelectValue(current)}
                    />
                  </Field>
                </SettingTrackRow>
              </SettingRowGroup>
              {gloss === null ? null : <Text voice="gloss">{gloss}</Text>}
            </Stack>
          );
        }}
      </form.AppField>
    </Section>
  );
}

/** SAMPLING (§4 cluster 2) — one KnobRow per capability-listed knob, then the seed row, the DRY breakers and the
 *  sampler order where the model takes them. Absent when the model takes none of them. */
function SamplingCluster({
  form,
  capability,
  effective,
}: {
  readonly form: AppForm;
  readonly capability: GenerationCapability;
  readonly effective: EffectiveProfileRow | undefined;
}): ReactElement | null {
  const knobs = samplingKnobsFor(capability);
  const stages = samplerStagesFor(capability);
  const seed = statesKnob(capability, "seed");
  const breakers = statesKnob(capability, "drySequenceBreakers");
  const skipped = mirostatSkipped(effective, capability.sampling.mirostatSkips);
  if (knobs.length === 0 && !seed && !breakers && stages === undefined) {
    return null;
  }
  return (
    <Section kicker="Sampling">
      {knobs.length === 0 ? null : (
        <form.Subscribe selector={(state): Quality | undefined => state.values.params.quality}>
          {(quality): ReactElement => (
            // ONE grid per cluster: the name track sizes to the widest name IN THIS CLUSTER, which is what
            // gives the column its single x (`KnobGrid`'s own note carries why the track keeps the token as a
            // floor rather than sizing purely to content).
            <KnobGrid>
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
                  note={skipped.has(knob.key) ? MIROSTAT_SKIPPED_GLOSS : undefined}
                  quality={quality}
                  step={knob.step}
                  {...(knob.step === INTEGER_STEP ? { largeStep: pageStep(knob.range.min, knob.range.max) } : {})}
                />
              ))}
            </KnobGrid>
          )}
        </form.Subscribe>
      )}
      {seed ? (
        <SettingRowGroup>
          <SettingTrackRow>
            <form.AppField name="params.seed">
              {(field): ReactElement => (
                <field.NumberField hint="A fixed seed makes sampling reproducible." label={SAMPLING_FLAG_LABELS.seed} placeholder="random" />
              )}
            </form.AppField>
          </SettingTrackRow>
        </SettingRowGroup>
      ) : null}
      {breakers ? <DrySequenceBreakers form={form} /> : null}
      {stages === undefined ? null : <SamplerOrder form={form} stages={stages} />}
    </Section>
  );
}

/** REASONING (§4 cluster 3) — the switch, the model's real effort levels or its budget KnobRow, the display mode
 *  and the seeded reasoning, each only where the model takes it. Absent on a model that cannot reason, and on one
 *  where none of its controls applies. */
function ReasoningCluster({
  form,
  capability,
  effective,
}: {
  readonly form: AppForm;
  readonly capability: GenerationCapability;
  readonly effective: EffectiveProfileRow | undefined;
}): ReactElement | null {
  const switchable = statesKnob(capability, "reasoning");
  const effort = effortLevelsFor(capability);
  const display = statesKnob(capability, "thinkingDisplay") ? (capability.reasoning.displayModes ?? []) : [];
  const seedable = statesKnob(capability, "reasoningSeed");
  const budget = budgetRangeFor(capability);
  if (!switchable && effort === undefined && display.length === 0 && !seedable && budget === undefined) {
    return null;
  }
  return (
    <Section kicker="Reasoning">
      {switchable || effort !== undefined || display.length > 0 ? (
        <SettingRowGroup>
          <form.AppField name="params.effort">
            {(field): ReactElement => {
              const stored = field.state.value;
              // A model that cannot stop reasoning has no switch, and its effort select always shows.
              const on = !switchable || stored !== "none";
              return (
                // A FRAGMENT, NOT A BOX: both rows are CELLS of the group's shared track set (the switch and
                // the effort select start their controls at one x), and a wrapper would make the pair ONE
                // grid item, which is the same reason `KnobRow` returns a fragment into `KnobGrid`.
                <>
                  {switchable ? (
                    <SettingTrackRow>
                      <Field label="Reasoning" name={field.name}>
                        <Switch checked={on} onCheckedChange={(next): void => field.handleChange(next ? undefined : "none")} />
                      </Field>
                    </SettingTrackRow>
                  ) : null}
                  {on && effort !== undefined ? (
                    <EffortField levels={effort} onChange={field.handleChange} value={stored === "none" ? undefined : stored} />
                  ) : null}
                </>
              );
            }}
          </form.AppField>
          {display.length === 0 ? null : <ThinkingDisplayField effective={effective} form={form} offered={display} />}
        </SettingRowGroup>
      ) : null}
      {/* The authored chain of thought the model CONTINUES FROM (the seed on the continue row). OUTSIDE the
          row group like the knobs below: a textarea is not a docked control column. Both behaviors are
          measured vendor facts (docs/law/deepseek-api-surface.md): a finished seed is adopted whole and the
          answer follows it; a seed that stops mid-thought is completed by the model in its own reasoning.
          One textarea, no toggle — the seed's own shape picks the mode. Only a route that carries the seed
          shows it (`reasoning.seedable`). */}
      {seedable ? (
        <form.AppField name="params.reasoningSeed">
          {(field): ReactElement => (
            <field.TextareaField
              hint="Reasoning you write for the model. Finish the thought and the model adopts it whole and answers from it; stop mid-thought and the model finishes it in its own reasoning. Rides only replies started for the model (prefill)."
              label="Seeded reasoning"
              placeholder="The user asked in English, but my instructions say to answer in Spanish…"
              rows={3}
            />
          )}
        </form.AppField>
      ) : null}
      {/* OUTSIDE the row group: a KnobGrid declares its OWN tracks (a rail is not a docked control column), and
          dropped into the group's grid it would take the label track alone. */}
      {budget === undefined ? null : <BudgetKnob effective={effective} form={form} range={budget} />}
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
    // A one-row cluster still needs the grid — a KnobRow IS cells, so its tracks have to come from somewhere.
    <KnobGrid>
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
    </KnobGrid>
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
  const items: SelectItems = levels.map((level) => ({ value: level, label: level }));
  return (
    <SettingTrackRow>
      <Field label="Effort" name="reasoning-effort">
        <Select
          aria-label="Effort"
          items={items}
          onValueChange={(next): void => onChange(next === null || next === "" ? undefined : (next as EffortLevel))}
          placeholder="Model default"
          value={value ?? ""}
        />
      </Field>
    </SettingTrackRow>
  );
}

/** `params.thinkingDisplay` — re-homed from Prompt ▸ Message delivery (§3 map, F4). Unset GHOSTS the
 *  funnel's own resolved display mode rather than rendering an empty combobox (side-eye F-05); with no
 *  reading it says "model default" instead of inventing one. */
function ThinkingDisplayField({
  form,
  effective,
  offered,
}: {
  readonly form: AppForm;
  readonly effective: EffectiveProfileRow | undefined;
  /** The display modes the model offers; only those are choices. */
  readonly offered: readonly ThinkingDisplay[];
}): ReactElement {
  const resolved = effective?.knobs["thinkingDisplay"]?.value;
  return (
    <SettingTrackRow>
      <form.AppField name="params.thinkingDisplay">
        {(field): ReactElement => (
          <field.SelectField
            hint="How the model's reasoning is shown, when it reasons."
            items={thinkingDisplayItems(offered)}
            label="Reasoning display"
            placeholder={resolved === undefined ? "Model default" : thinkingDisplayLabel(String(resolved))}
          />
        )}
      </form.AppField>
    </SettingTrackRow>
  );
}
