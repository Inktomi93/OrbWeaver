// The params deck's LIMIT clusters — OUTPUT · CONTEXT ·
// ADVANCED. Split out of params-deck.tsx for the component-size cap; it is one continuous column with the
// clusters above it, not a second surface.
//
// OUTPUT/CONTEXT ride the SAME KnobRow grammar as sampling at capability-fed integer ranges (owner ruling,
// mock round 3): output spans 1..`capability.output.maxTokens.max`, context spans 1..`capability.context
// .window`, step 1, with a range-sized `largeStep` for keyboard paging — precision entry is the twin's job,
// so a 0..131072 range needs no log scale.
//
// Gap-closes landed here (§10): G2 `params.stop` (a chip list — capability-gated on `sampling.stop`, as
// the banned-phrase list and the EOS ban are on their own flags),
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

import type { GenerationCapability, Verbosity } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import {
  DEFAULT_COMPACT_INSTRUCTIONS,
  DEFAULT_COMPACTION_MODE,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MANAGED_COMPACT_DEFAULT_PCT,
  MANAGED_VERBATIM_TAIL,
} from "@orb/contracts/preset";
import { groupThousands } from "@orb/kit/strings";
import { windowInputRoom } from "@orb/kit/tokens";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { SettingRowGroup, SettingTrackRow } from "#components";
import type { AppFormInstance } from "#forms/editor";
import { pageStep, verbosityLevelsFor } from "../lib/capability-panel-model.ts";
import type { EffectiveProfileRow } from "../lib/effective-knobs.ts";
import { SENT_WINDOW_PROVENANCE } from "../lib/effective-knobs.ts";
import { COMPACTION_MODE_ITEMS, compactionModeLabel } from "../lib/preset-nav.ts";
import { SAMPLING_FLAG_LABELS } from "../lib/sampling-knob-catalog.ts";
import { KnobGrid, KnobRow } from "./knob-row.tsx";
import { LogitBiasEditor } from "./logit-bias-editor.tsx";
import { BannedPhrases, StopSequences } from "./sequence-chips.tsx";

type AppForm = AppFormInstance<PromptConfig>;

export interface ParamsLimitsProps {
  readonly form: AppForm;
  readonly capability: GenerationCapability | undefined;
  readonly effective: EffectiveProfileRow | undefined;
}

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
  readonly capability: GenerationCapability;
  readonly effective: EffectiveProfileRow | undefined;
}): ReactElement {
  const outputMax = capability.output.maxTokens.max;
  const window = capability.context.window;
  // On a route that sends the window (Ollama's native `num_ctx`) this knob sets it, so it reaches the trained maximum.
  const contextMax = capability.context.settable?.max ?? window;
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
        <form.Subscribe
          selector={(state): { readonly maxOutputTokens: number | undefined; readonly maxContextTokens: number | undefined } => ({
            maxOutputTokens: state.values.params.maxOutputTokens,
            maxContextTokens: state.values.params.maxContextTokens,
          })}
        >
          {(limits): ReactElement => (
            <KnobRow
              effective={{ value: window, provenance: capability.context.settable === undefined ? "window" : SENT_WINDOW_PROVENANCE }}
              form={form}
              hint={maxContextHint(capability.context, Math.min(limits.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS, outputMax), limits.maxContextTokens)}
              label="Max context tokens"
              largeStep={pageStep(1, contextMax)}
              max={contextMax}
              min={1}
              name="params.maxContextTokens"
              // A stored value past this connection's window (set on a wider one) is capped here, not sent as typed.
              note={
                limits.maxContextTokens !== undefined && limits.maxContextTokens > contextMax
                  ? `capped at ${groupThousands(contextMax)} on this connection`
                  : undefined
              }
              step={1}
            />
          )}
        </form.Subscribe>
      </KnobGrid>
      <SettingRowGroup>
        {verbosityLevels === undefined ? null : (
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
        )}
        {/* Shown for every model, because a preset outlives the model it is previewed on: the hint says
            whether THIS model can draw, and a text-only model drops the knob with a chat warning. Off clears
            the field, so a preset that never asked for pictures stores nothing. */}
        <SettingTrackRow>
          <form.Subscribe selector={(state): boolean => state.values.params.replyMedia === "text+image"}>
            {(on): ReactElement => (
              <Field hint={replyPicturesHint(capability)} label="Reply pictures">
                <Switch checked={on} onCheckedChange={(next): void => form.setFieldValue("params.replyMedia", next ? "text+image" : undefined)} />
              </Field>
            )}
          </form.Subscribe>
        </SettingTrackRow>
        {capability.sampling.banEos === true ? <BanEosRow form={form} /> : null}
      </SettingRowGroup>
      {/* OUTSIDE the row group: these are `Fieldset` GROUPS (N chips plus an add box), not label/control
          rows, so each declares its own block instead of taking the group's label track. */}
      {capability.sampling.stop === true ? <StopSequences form={form} /> : null}
      {capability.sampling.bannedStrings === true ? <BannedPhrases form={form} /> : null}
    </Section>
  );
}

/** The Max context tokens hint: the model window, the room it leaves for prompt and history once the reply and
 *  the safety margin are held back (the number the chat Preview bar draws), and a warning when the cap leaves no
 *  room beside the reply. On a route that sends the window, the knob sets it rather than capping below it. */
function maxContextHint(context: GenerationCapability["context"], reserveOutputTokens: number, maxContextTokens: number | undefined): string {
  const { window, settable } = context;
  const room = windowInputRoom(window, reserveOutputTokens);
  const base =
    settable === undefined
      ? `Soft-caps the working set below the model window — older turns beyond this are trimmed. This model's window is ${groupThousands(window)} tokens; ${groupThousands(room)} of them fit prompt and history after the reply and the safety margin.`
      : `How much context this server runs, up to ${groupThousands(settable.max)} tokens. Unset, it runs ${groupThousands(window)}.`;
  return maxContextTokens !== undefined && maxContextTokens <= reserveOutputTokens
    ? `${base} The reply (${groupThousands(reserveOutputTokens)}) is larger than this limit, so only the newest message is sent.`
    : base;
}

/** `params.banEos`: on stores `true`, off clears the field (the server's own default lets the reply end). */
function BanEosRow({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <SettingTrackRow>
      <form.Subscribe selector={(state): boolean => state.values.params.banEos === true}>
        {(on): ReactElement => (
          <Field hint="Stops the model from ending its reply early; it writes until the output cap or a stop sequence." label={SAMPLING_FLAG_LABELS.banEos}>
            <Switch checked={on} onCheckedChange={(next): void => form.setFieldValue("params.banEos", next ? true : undefined)} />
          </Field>
        )}
      </form.Subscribe>
    </SettingTrackRow>
  );
}

/** The Reply pictures hint, by whether the previewed model's output can carry images. */
function replyPicturesHint(capability: GenerationCapability): string {
  return capability.output.modalities.includes("image")
    ? "Lets the model answer with pictures in the chat as well as text. This model can draw them."
    : "Lets an image-capable model answer with pictures in the chat. This model writes text only, so it ignores this, and its replies say so.";
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
          <LogitBiasEditor form={form} />
          <SettingRowGroup>
            <SettingTrackRow>
              {/* Unset is the model's own default, which allows parallel calls on every wire that has the control, so
                  the switch reads on until the preset stores `false`. Off writes `false`; on clears the field. */}
              <form.Subscribe selector={(state): boolean => state.values.params.advanced?.parallelToolCalls !== false}>
                {(parallel): ReactElement => (
                  <Field
                    hint="Let the model emit several tool calls in one turn. Turn it off to ask for one call at a time. Claude subscription connections have no such setting, and each reply that carries tools says so."
                    label="Parallel tool calls"
                  >
                    <Switch
                      checked={parallel}
                      onCheckedChange={(on): void => form.setFieldValue("params.advanced.parallelToolCalls", on ? undefined : false)}
                    />
                  </Field>
                )}
              </form.Subscribe>
            </SettingTrackRow>
          </SettingRowGroup>
          <Text voice="gloss">
            `advanced.claudeEnv` is deliberately editor-less — it is a config-tier escape hatch for the agent-sdk process environment, not a generation knob.
          </Text>
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}
