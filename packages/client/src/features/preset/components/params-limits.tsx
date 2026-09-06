// The params deck's LIMIT clusters (preset-surface-redesign.md §4 clusters 4-6) — OUTPUT · CONTEXT ·
// ADVANCED. Split out of params-deck.tsx for the component-size cap; it is one continuous column with the
// clusters above it, not a second surface.
//
// OUTPUT/CONTEXT ride the SAME KnobRow grammar as sampling at capability-fed integer ranges (owner ruling,
// mock round 3): output spans 1..`capability.output.maxTokens.max`, context spans 1..`capability.context
// .window`, step 1, with a range-sized `largeStep` for keyboard paging — precision entry is the twin's job,
// so a 0..131072 range needs no log scale.
//
// Gap-closes landed here (§10): G2 `params.stop` (a chip list — capability-gated on `sampling.stop`),
// G3 `params.providerContextCompression`, G4 `params.compaction.verbatimTail`. `maxBudgetUsd` has no row
// here because the FIELD is gone: D6 ("build its OUTPUT editor, or delete the field") was resolved DELETE
// by the owner, 2026-08-02 — it was reachable from no surface, so nobody could set, read, or clear it.
// Retired via the v5→v6 config lift in `@orb/contracts/preset`.
//
// CONTEXT + ADVANCED render with NO capability: compaction and the escape hatches are ours, not the
// model's. ADVANCED is the deck's ONE collapsed disclosure (genuinely rare escape hatches).
//
// The `<Field>` rows here ride `SettingRowGroup` + `SettingTrackRow` for the reason params-deck.tsx's header
// states (#1770 — `row-void`); what stays OUTSIDE a group is anything that is not a label/control pair:
// the KnobGrids (their own track set), the stop-sequence `Fieldset` (a group, not a row), the compaction
// gloss and the vertical `Summary instructions` textarea.

import type { ModelCapability, Verbosity } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_COMPACT_INSTRUCTIONS, DEFAULT_COMPACTION_MODE, MANAGED_COMPACT_DEFAULT_PCT, MANAGED_VERBATIM_TAIL } from "@orb/contracts/preset";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";
import { SettingRowGroup, SettingTrackRow } from "#components";
import type { AppFormInstance } from "#forms";
import { pageStep, verbosityLevelsFor } from "../lib/capability-panel-model.ts";
import type { EffectiveProfileRow } from "../lib/effective-knobs.ts";
import { COMPACTION_MODE_ITEMS, compactionModeLabel } from "../lib/preset-nav.ts";
import { CustomParametersEditor } from "./custom-parameters-editor.tsx";
import { KnobGrid, KnobRow } from "./knob-row.tsx";

import { StopSequences } from "./stop-sequences.tsx";

type AppForm = AppFormInstance<PromptConfig>;

export interface ParamsLimitsProps {
  readonly form: AppForm;
  readonly capability: ModelCapability | undefined;
  readonly effective: EffectiveProfileRow | undefined;
}

const DYNAMIC_CONTEXT_ITEMS: SelectItems<string> = [
  { value: "", label: "Auto (model-appropriate)" },
  { value: "system", label: "Join into the cached system prompt" },
  { value: "hook", label: "Deliver at the message tail (cache-safe)" },
];

export function ParamsLimits({ form, capability, effective }: ParamsLimitsProps): ReactElement {
  return (
    <>
      {/* No capability ⇒ OUTPUT is absent with its two sibling clusters, under the deck's ONE gate note
          (side-eye F-02: three per-cluster notes printed the same sentence three times). */}
      {capability === undefined ? null : <OutputCluster capability={capability} effective={effective} form={form} />}
      <ContextCluster form={form} />
      <AdvancedCluster form={form} />
    </>
  );
}

/** OUTPUT (§4 cluster 4) — the two token caps as ghost-armed KnobRows at the model's real ceilings, plus
 *  verbosity and the stop-sequence chips. */
function OutputCluster({
  form,
  capability,
  effective,
}: {
  readonly form: AppForm;
  readonly capability: ModelCapability;
  readonly effective: EffectiveProfileRow | undefined;
}): ReactElement {
  const outputMax = capability.output.maxTokens.max;
  const window = capability.context.window;
  const verbosityLevels = verbosityLevelsFor(capability);
  return (
    <Section kicker="Output">
      {/* The two LONGEST names on the deck live here, and the fixed label box clipped both at every pane
          width until the column became a content-sized grid track (side-eye 2026-08-19 P1-1). */}
      <KnobGrid>
        {/* Blank-means-default in STORAGE; the ghost shows what the turn would actually send. Max output's
            ghost is the funnel's own floor (`DEFAULT_MAX_OUTPUT_TOKENS`, provenance `default`). */}
        <KnobRow
          effective={effective?.knobs["maxOutputTokens"]}
          form={form}
          hint={`Caps the length of one reply. This model accepts up to ${outputMax} output tokens.`}
          label="Max output tokens"
          largeStep={pageStep(1, outputMax)}
          max={outputMax}
          min={1}
          name="params.maxOutputTokens"
          step={1}
        />
        {/* `maxContextTokens` never enters the turn funnel (it is OUR history soft-cap, not a wire knob),
            so `resolveEffective` deliberately reports nothing for it — the ghost is the model's window,
            read straight off the capability, with the `full window` gloss the mock carries. */}
        <KnobRow
          effective={{ value: window, provenance: "window" }}
          form={form}
          hint={`Soft-caps the working set below the model window — older turns beyond this are trimmed. This model's window is ${window} tokens.`}
          label="Max context tokens"
          largeStep={pageStep(1, window)}
          max={window}
          min={1}
          name="params.maxContextTokens"
          step={1}
        />
      </KnobGrid>
      {verbosityLevels === undefined ? null : (
        <SettingRowGroup>
          <SettingTrackRow>
            <form.AppField name="params.verbosity">
              {(field): ReactElement => {
                const value = field.state.value as Verbosity | undefined;
                const items: SelectItems<string> = verbosityLevels.map((level) => ({ value: level, label: level }));
                return (
                  <Field hint="How terse or expansive the model's replies run." label="Verbosity" name={field.name}>
                    <Select
                      aria-label="Verbosity"
                      items={items}
                      onValueChange={(next): void => field.handleChange(next === null || next === "" ? undefined : (next as Verbosity))}
                      placeholder="Model default"
                      value={value ?? ""}
                    />
                  </Field>
                );
              }}
            </form.AppField>
          </SettingTrackRow>
        </SettingRowGroup>
      )}
      {/* OUTSIDE the row group: this is a `Fieldset` GROUP (N chips plus an add box), not a label/control
          row, so it declares its own block instead of taking the group's label track. */}
      {capability.sampling.stop === true ? <StopSequences form={form} /> : null}
    </Section>
  );
}

/** CONTEXT (§4 cluster 5) — compaction mode/threshold/instructions (re-homed from the Compaction leaf),
 *  plus the two knobs that had no editor anywhere: `verbatimTail` (G4) and `providerContextCompression`
 *  (G3). Renders with no capability: this is our engine's behavior, not the model's. */
function ContextCluster({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <Section kicker="Context">
      <SettingRowGroup>
        <SettingTrackRow>
          <form.AppField name="params.compaction.mode">
            {(field): ReactElement => (
              <field.SelectField
                hint="Managed folds older turns into a durable compaction marker once the context fills past the threshold, and that marker is chat canon — it survives a model swap. Auto lets the runner compact its own session instead. Context is always kept in bounds; this only picks how."
                items={COMPACTION_MODE_ITEMS}
                label="Compaction mode"
                placeholder={`Default — ${compactionModeLabel(DEFAULT_COMPACTION_MODE)}`}
              />
            )}
          </form.AppField>
        </SettingTrackRow>
        <SettingTrackRow>
          <form.AppField name="params.compaction.thresholdPct">
            {(field): ReactElement => (
              <field.NumberField
                hint="Managed mode summarizes once the context fills past this fraction (0.5–0.99)."
                label="Managed threshold"
                max={0.99}
                min={0.5}
                placeholder={`${MANAGED_COMPACT_DEFAULT_PCT} (default)`}
                step={0.01}
              />
            )}
          </form.AppField>
        </SettingTrackRow>
        {/* G4: the "missing 4th compaction knob" — minted on the schema, never given an editor. */}
        <SettingTrackRow>
          <form.AppField name="params.compaction.verbatimTail">
            {(field): ReactElement => (
              <field.NumberField
                hint="How many of the newest messages stay literal when managed compaction runs — everything older folds into the compaction marker."
                label="Verbatim tail"
                max={100}
                min={1}
                placeholder={`${MANAGED_VERBATIM_TAIL} (engine default)`}
                step={1}
              />
            )}
          </form.AppField>
        </SettingTrackRow>
        {/* G3: the provider's OWN context compression — honest per-backend gloss, since only some honor it. */}
        <SettingTrackRow>
          <form.AppField name="params.providerContextCompression">
            {(field): ReactElement => (
              <field.SwitchField
                hint="Ask the provider to compress context on its side. Only backends that advertise it honor this; the rest ignore it silently."
                label="Provider context compression"
              />
            )}
          </form.AppField>
        </SettingTrackRow>
      </SettingRowGroup>
      {/* HONEST-DEGRADE: the runner's own auto-compaction never exposes its summary, so `auto` stores no
          marker — no carry-forward on a model swap and nothing readable in the transcript. Shown plainly. */}
      <form.Subscribe selector={(state): string | undefined => state.values.params.compaction?.mode}>
        {(mode): ReactElement | null =>
          mode === "auto" ? (
            <Text voice="gloss">
              Auto uses the runner's own compaction. It won't produce a readable summary, so there's no compaction marker in the transcript and nothing carries
              forward if you switch this chat to another model. Choose managed to keep a durable, portable summary.
            </Text>
          ) : null
        }
      </form.Subscribe>
      {/* Same one-helper-voice rule as Stop sequences above (crunch-list 21): hover hint, not a 13px
          always-visible description line. */}
      <form.AppField name="params.compaction.instructions">
        {(field): ReactElement => (
          // THE GHOST (side-eye F-11 / crunch-list O-6). This was the one field on the deck with no
          // placeholder: the hint said "leave blank for the RP-tuned default" while the field showed
          // nothing, so the user could not see WHAT runs if they leave it blank — on a deck that had
          // taught them a ghost would be there (`0.85 (default)`, `8 (engine default)`, `default`). The
          // ghost is the shipped default VERBATIM, off the contract that the engine actually falls back
          // to (`DEFAULT_COMPACT_INSTRUCTIONS`), so the two can never drift into a plausible lie.
          <field.TextareaField
            hint="How to steer the summary (leave blank for the RP-tuned default)."
            label="Summary instructions"
            placeholder={DEFAULT_COMPACT_INSTRUCTIONS}
            rows={3}
          />
        )}
      </form.AppField>
    </Section>
  );
}

/** ADVANCED (§4 cluster 6) — the deck's ONE collapsed disclosure: the genuinely rare escape hatches. */
function AdvancedCluster({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <Collapsible>
      {/* IT IS A CONTROL, NOT A KICKER (side-eye 2026-08-22 P2-4). `voice="kicker"` is the 10.5px SECTION
          EYEBROW — right for a label that names a group, wrong for the only thing you can press to reach
          this one: measured 544×16 with a 10.5px label, below both WCAG 2.5.8's 24×24 floor on any pointer
          and the 11px functional-text floor `design-audit` reds, and the primitive's `::after` touch pseudo
          is not in play here (it resolves `content: none`). `voice="label"` is the 13px control step the
          `CollapsibleTrigger` primitive already defaults to — the kicker was overriding it DOWN — and
          `size="control"` is the primitive's own ≥44px coarse row box (a VARIANT, not a call-site `min-h-*`
          — tailwind-merge cannot classify a custom-token utility, so an override wins or loses by
          stylesheet order; gate `ui-size-via-variant`). The trigger is `inline-flex`, so the box grows
          around the word rather than claiming the row's width. */}
      <CollapsibleTrigger size="control">
        <Text voice="label">Advanced</Text>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="field">
          {/* THE ONLY UNCONTROLLED FIELD ON THE DECK, AND THEREFORE THE ONLY ONE THAT NEEDED A KEY (#1502).
              It is uncontrolled because the value is a JSON MAP the user edits as TEXT — a controlled
              `value` would have to round-trip through `parseLogitBias` on every keystroke and eat any
              half-typed brace. But React applies `defaultValue` at MOUNT and never again, so switching
              presets left the previous preset's JSON sitting in the box, and — the half that made it a
              two-writer bug rather than a display glitch — the next `onBlur` wrote that stale text back
              over the newly-loaded preset's own bias map. The subscribed serialization is the field's
              IDENTITY: a preset switch changes it, so React remounts the textarea around the new text,
              while typing changes nothing (the form value only moves on blur) so an open edit is never
              disturbed. A blur that stores a map re-mounts with the CANONICAL serialization of what was
              actually stored, which is also the honest answer to "invalid JSON is ignored" — the box now
              shows what the preset holds instead of text that looks saved and is not. */}
          <LogitBiasField form={form} />
          <SettingRowGroup>
            <SettingTrackRow>
              <form.Subscribe selector={(state): boolean => state.values.params.advanced?.parallelToolCalls === true}>
                {(parallel): ReactElement => (
                  <Field hint="Let the model emit several tool calls in one turn." label="Parallel tool calls">
                    {/* The `aria-label` is UNREACHABLE and still REQUIRED (#1621) — the Field's label reaches
                      this control through Base UI's `aria-labelledby` and outranks it
                      (`tests/client/a11y/field-control-name.suite.ct.tsx`), but `jsx-a11y` resolves `Switch`
                      to `button`, outside its `ignoreElements`, so dropping it reds
                      `control-has-associated-label`. A lint obligation, not an accessible name. */}
                    <Switch
                      aria-label="Parallel tool calls"
                      checked={parallel}
                      onCheckedChange={(on): void => form.setFieldValue("params.advanced.parallelToolCalls", on ? true : undefined)}
                    />
                  </Field>
                )}
              </form.Subscribe>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.Subscribe selector={(state): string | undefined => state.values.params.advanced?.dynamicContext}>
                {(dynamicContext): ReactElement => (
                  <Field hint="Where the per-turn system half is delivered on the wire." label="Dynamic-context delivery">
                    <Select
                      aria-label="Dynamic-context delivery"
                      items={DYNAMIC_CONTEXT_ITEMS}
                      onValueChange={(next): void =>
                        form.setFieldValue("params.advanced.dynamicContext", next === "system" || next === "hook" ? next : undefined)
                      }
                      value={dynamicContext ?? ""}
                    />
                  </Field>
                )}
              </form.Subscribe>
            </SettingTrackRow>
          </SettingRowGroup>
          <CustomParametersEditor form={form} />
          <Text voice="gloss">
            `advanced.claudeEnv` is deliberately editor-less — it is a config-tier escape hatch for the agent-sdk process environment, not a generation knob.
          </Text>
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/**
 * The logit-bias escape hatch — the deck's ONE uncontrolled field, and therefore the only one that needed a
 * key (#1502). It is uncontrolled because the value is a JSON MAP the user edits as TEXT: a controlled
 * `value` would round-trip through `parseLogitBias` on every keystroke and eat any half-typed brace. But
 * React applies `defaultValue` at MOUNT and never again, so switching presets left the previous preset's
 * JSON sitting in the box, and — the half that made it a two-writer bug rather than a display glitch — the
 * next `onBlur` wrote that stale text back over the newly-loaded preset's bias map.
 *
 * THE KEY IS THE STORED SERIALIZATION **PLUS A BLUR EPOCH**, and the epoch is the #1570 half. The stored
 * serialization alone made the field's own ruling — "a blur re-mounts with the CANONICAL serialization of
 * what was actually stored, which is the honest answer to 'invalid JSON is ignored'" — true in only one
 * direction. Blur invalid text OVER a stored map and the map becomes `undefined`, the key changes, the box
 * clears: correct. Blur the SAME invalid text with NO stored map and the field value does not move, so the
 * key does not either, so the box keeps text that looks saved and is not. One input, two behaviours.
 *
 * The epoch makes every blur a remount, so the box always shows what the preset HOLDS. Typing still changes
 * nothing (the epoch moves on blur, the serialization only when the form value does), so an open edit is
 * never disturbed — which is the property the key was introduced to protect.
 */
function LogitBiasField({ form }: { readonly form: AppForm }): ReactElement {
  const [blurEpoch, setBlurEpoch] = useState(0);
  return (
    <form.Subscribe selector={(state): string => serializeLogitBias(state.values.params.logitBias)}>
      {(serialized): ReactElement => (
        <Field hint="A JSON map of token id → bias (-100…100). Nudges or blocks specific tokens. Invalid JSON is ignored." label="Logit bias">
          {/* No `aria-label` (#1621, the Textarea family): this box is the Field's sole `Field.Control`, so
              the label reaches it through Base UI's `aria-labelledby`, which outranks the attribute. The name
              is unchanged — `params-deck.ct.tsx` finds it by `getByRole("textbox", { name: "Logit bias" })`
              both before and after. Measured at `tests/client/a11y/field-control-name.suite.ct.tsx`. */}
          <Textarea
            defaultValue={serialized}
            key={`${String(blurEpoch)}:${serialized}`}
            onBlur={(e): void => {
              form.setFieldValue("params.logitBias", parseLogitBias(e.target.value));
              setBlurEpoch((epoch: number): number => epoch + 1);
            }}
            rows={3}
          />
        </Field>
      )}
    </form.Subscribe>
  );
}

/** The stored bias map as the textarea's text — and, because it is the field's `key`, its IDENTITY.
 *  `""` for an unset map, so "no bias" and "a bias this build stored" are different fields. */
function serializeLogitBias(logitBias: Record<string, number> | undefined): string {
  return logitBias === undefined ? "" : JSON.stringify(logitBias);
}

/** Parse the logit-bias JSON textarea → a `Record<string, number>` (or `undefined` on empty/invalid — the
 *  escape hatch never crashes the form; the server re-validates via `userIntentSchema`). */
function parseLogitBias(raw: string): Record<string, number> | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return;
  }
  let parsed: unknown;
  // @orb-gate-ignore caught-failure-ownership(default:catch): the doc comment above explains — an unparseable
  // value returns undefined, which the caller treats as "not set", and the server re-validates via
  // userIntentSchema. Ends if the caller starts trusting this return without server-side re-validation.
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return; // invalid JSON — the escape hatch never crashes the form.
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return;
  }
  const entries = Object.entries(parsed).filter(([, v]) => typeof v === "number") as [string, number][];
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}
