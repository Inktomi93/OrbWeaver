// The PARAMS DECK (preset-surface-redesign.md §4) — the redesign's centerpiece and the Params view's whole
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
//
// EVERY NON-KNOB ROW IS A SHARED-TRACK ROW (#1770). The deck's `<Field>` rows used to sit in
// `FieldLayout orientation="horizontal"`'s DEFAULT `block` arm — a flex `justify-between` against the pane
// with a `w-(--width-control-col)` dock — so the distance from a name to its control was whatever the
// window happened to be: `design-audit` filed five `row-void`s on this tab at 46-57% of a 544px row
// (Quality · Seed · Reasoning · Effort · Verbatim tail), and the gap GREW with the pane (452px at 720,
// 476px at 1520, with the control's x moving with it). They are `SettingRowGroup` + `ParamsRow` now
// (#932's ratified answer): the label track is `--width-control-col`, so every control on the deck starts
// at ONE x that does not move — measured identical at 560/720/1120/1520 and stacked below the group's own
// step. A knob row is NOT one of these: its control is a flexing rail, which is `KnobGrid`'s own track set
// (`--width-label-col`), and the two tokens are deliberately different widths (see their descriptions).

import type { EffortLevel, ModelCapability, Range } from "@orb/contracts/connection";
import type { PromptConfig, Quality } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack, Surface } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { SettingRowGroup } from "#components";
import type { AppFormInstance } from "#forms";
import {
  pageStep,
  QUALITY_SELECT_ITEMS,
  qualityFromSelect,
  qualitySelectValue,
  reasoningControlFor,
  samplingKnobsFor,
  supportsSeed,
} from "../lib/capability-panel-model.ts";
import type { EffectiveProfileRow } from "../lib/effective-knobs.ts";
import { qualityDeckGloss } from "../lib/effective-knobs.ts";
import { THINKING_DISPLAY_ITEMS, thinkingDisplayLabel } from "../lib/preset-nav.ts";
import type { ReadFailure } from "../lib/resolve-failure.ts";
import { CapabilityGate } from "./capability-gate.tsx";
import { KnobGrid, KnobRow } from "./knob-row.tsx";
import { ParamsLimits } from "./params-limits.tsx";
import { ParamsRow } from "./params-row.tsx";

type AppForm = AppFormInstance<PromptConfig>;

export interface ParamsDeckProps {
  readonly form: AppForm;
  /** `undefined` until the capability read lands, and forever if it FAILS — QUALITY/CONTEXT/ADVANCED still
   *  render, the model-fed clusters stand down to `CapabilityGate`. Which of that gate's two arms shows is
   *  the `capabilityError` split, never this field: PENDING holds a skeleton, a FAILED read quotes the server
   *  and names the cause it has EARNED (a routing verdict only on a routing refusal — F-02 + the 2026-08-08
   *  earned-cause fix). There is no third arm — a settled-successful read always carries a descriptor, so
   *  `undefined` here means pending-or-failed and nothing else. */
  readonly capability: ModelCapability | undefined;
  /** The funnel projected for this preset (`preset.resolveEffective`) — `undefined` while it is
   *  unavailable (no chat model, or the read has not landed), which degrades to un-ghosted rows. */
  readonly effective: EffectiveProfileRow | undefined;
  /** The capability read's THROWN error object — `null` while the read is still PENDING. Passed WHOLE (not a
   *  flattened `.message`) so the gate discriminates the cause on `data.code`: only a routing refusal earns
   *  the routing verdict (side-eye F-02 + the 2026-08-08 earned-cause fix), and a pending read is not a state
   *  at all, so the gate must print neither over the other. `ReadFailure | null`, never `unknown`: an
   *  `undefined` leaking in would select the gate's FAILED arm under a read that never failed. */
  readonly capabilityError: ReadFailure | null;
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

export function ParamsDeck({ form, capability, effective, capabilityError }: ParamsDeckProps): ReactElement {
  return (
    <Surface tier="instrument">
      {/* THE DECK HAS ITS OWN MEASURE CAP (side-eye 2026-08-19 P2). The editor's content column BREATHES to
          `--width-content-col-wide` (896px) once the pane clears @5xl — right for prose and for the rack,
          wrong for an instrument: every surplus pixel goes into the knob TRACK, because the track is the
          row's only flexing cell. Measured at a 1224px pane: 595px of rail for a 0-2 temperature, i.e. ~300px
          per unit of a dial whose useful precision is 0.05 — a slider that got harder to aim as the window
          got bigger. The cap is `--width-content-col` (720px, the token whose own description IS this
          measure), and it is CENTERED inside the breathing column so the surplus is a symmetric margin
          rather than a one-sided void. Nothing else moves: the label cell, the numeric twin and the reset are
          fixed-width by token, so capping the row caps exactly the cell that was over-growing.

          THIS IS THE TOKEN'S ONE RATIFIED EXCEPTION, AND IT HAS NOW BEEN AUDITED AS ONE (#1682, refused).
          `--width-content-col` has eight consumers; #1664 gave seven of them the token's full stated
          consumption (`mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide)`),
          and a count over the remaining spellings read this site as the eighth oversight. It is not: an
          INSTRUMENT whose only flexing cell is a control track holds the cap and does NOT breathe, which is
          the 2026-08-19 ruling above. Measured again when the audit landed, by planting the briefed change
          here: the knob row went 720px → 896px, i.e. straight back into the over-grown rail that ruling
          exists to prevent — and it reds the `params-deck.ct.tsx` pin that asserts the row IS the cap. The
          deck is centered (`mx-auto w-full`) precisely so it sits symmetrically inside the column that DOES
          breathe around it. */}
      <Stack className="mx-auto w-full max-w-(--width-content-col)" gap="section">
        <QualityCluster effective={effective} form={form} />
        {/* ONE gate for the model-fed clusters, never three copies of the same sentence (F-02). Its arms are
            PENDING (a skeleton) and FAILED (the server's message) — see the gate's header for why those two
            are exhaustive and why the old connect-a-model empty state was a flash, not a state. */}
        {capability === undefined ? (
          <CapabilityGate error={capabilityError} />
        ) : (
          <>
            <SamplingCluster capability={capability} effective={effective} form={form} />
            <ReasoningCluster capability={capability} effective={effective} form={form} />
          </>
        )}
        <ParamsLimits capability={capability} effective={effective} form={form} />
      </Stack>
    </Surface>
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
    <Section kicker="Quality">
      <form.AppField name="params.quality">
        {(field): ReactElement => {
          const current = field.state.value as Quality | undefined;
          // ONE LINE (crunch-list 5): the MAPPING datum ("deep → effort high · temperature 1", the
          // server's own projection of the dial table) joined with the OVERRIDE status, exactly as the
          // mock draws it. Both halves stay separate derivations in `effective-knobs.ts`.
          const gloss = qualityDeckGloss(effective, current);
          return (
            <Stack gap="tight">
              <SettingRowGroup>
                <ParamsRow>
                  <Field
                    hint="The primary dial. It fills any knob you leave inherited below; anything you set explicitly wins over it."
                    label="Quality"
                    name={field.name}
                  >
                    <Select
                      aria-label="Quality"
                      items={QUALITY_SELECT_ITEMS}
                      onValueChange={(next): void => field.handleChange(qualityFromSelect(next))}
                      value={qualitySelectValue(current)}
                    />
                  </Field>
                </ParamsRow>
              </SettingRowGroup>
              {gloss === null ? null : <Text voice="gloss">{gloss}</Text>}
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
                quality={quality}
                step={knob.step}
              />
            ))}
          </KnobGrid>
        )}
      </form.Subscribe>
      {supportsSeed(capability) ? (
        <SettingRowGroup>
          <ParamsRow>
            <form.AppField name="params.seed">
              {(field): ReactElement => <field.NumberField hint="A fixed seed makes sampling reproducible." label="Seed" placeholder="random" />}
            </form.AppField>
          </ParamsRow>
        </SettingRowGroup>
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
        <SettingRowGroup>
          <ThinkingDisplayField effective={effective} form={form} />
        </SettingRowGroup>
      </Section>
    );
  }
  return (
    <Section kicker="Reasoning">
      <SettingRowGroup>
        <form.AppField name="params.effort">
          {(field): ReactElement => {
            const effort = field.state.value as EffortLevel | "none" | undefined;
            const on = effort !== "none";
            return (
              // A FRAGMENT, NOT A BOX: both rows are CELLS of the group's shared track set (the switch and
              // the effort select start their controls at one x), and a wrapper would make the pair ONE
              // grid item, which is the same reason `KnobRow` returns a fragment into `KnobGrid`.
              <>
                <ParamsRow>
                  <Field label="Reasoning" name={field.name}>
                    {/* THE `aria-label` HERE IS A LIE THE TREE NEVER REPEATS, and it cannot simply be deleted
                      (#1621). "Enable reasoning" is a DIFFERENT string from the Field's label, and it loses to
                      the Field's `aria-labelledby` — the switch announces "Reasoning"
                      (`tests/client/a11y/field-control-name.suite.ct.tsx`). Deleting it would red
                      `jsx-a11y/control-has-associated-label`, which resolves `Switch` to `button` and cannot
                      see the render-time context injection. So it is aligned to the name the tree actually
                      reports instead: the attribute stays for the rule, and stops promising a second name. */}
                    <Switch aria-label="Reasoning" checked={on} onCheckedChange={(next): void => field.handleChange(next ? undefined : "none")} />
                  </Field>
                </ParamsRow>
                {on && control.kind === "effort" ? <EffortField levels={control.effortLevels ?? []} onChange={field.handleChange} value={effort} /> : null}
              </>
            );
          }}
        </form.AppField>
        <ThinkingDisplayField effective={effective} form={form} />
      </SettingRowGroup>
      {/* OUTSIDE the row group, both of them: a KnobGrid declares its OWN tracks (a rail is not a docked
          control column) and the adaptive note is a paragraph, and either one dropped into the group's
          grid would take the label track alone. */}
      {control.kind === "budget" && control.budgetRange !== undefined ? <BudgetKnob effective={effective} form={form} range={control.budgetRange} /> : null}
      {control.kind === "adaptive" ? (
        <Text voice="gloss">This model reasons adaptively — it self-budgets per turn, so there is no manual effort dial.</Text>
      ) : null}
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
  const items: SelectItems<string> = levels.map((level) => ({ value: level, label: level }));
  return (
    <ParamsRow>
      <Field label="Effort" name="reasoning-effort">
        <Select
          aria-label="Effort"
          items={items}
          onValueChange={(next): void => onChange(next === null || next === "" ? undefined : (next as EffortLevel))}
          placeholder="Model default"
          value={value ?? ""}
        />
      </Field>
    </ParamsRow>
  );
}

/** `params.thinkingDisplay` — re-homed from Prompt ▸ Message delivery (§3 map, F4). Unset GHOSTS the
 *  funnel's own resolved display mode rather than rendering an empty combobox (side-eye F-05); with no
 *  reading it says "model default" instead of inventing one. */
function ThinkingDisplayField({ form, effective }: { readonly form: AppForm; readonly effective: EffectiveProfileRow | undefined }): ReactElement {
  const resolved = effective?.knobs["thinkingDisplay"]?.value;
  return (
    <ParamsRow>
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
    </ParamsRow>
  );
}
