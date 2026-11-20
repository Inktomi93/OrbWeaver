// The params deck's LIMIT clusters — OUTPUT · CONTEXT ·
// ADVANCED. Apart from params-deck.tsx; it is one continuous column with the
// clusters above it, not a second surface.
//
// Each of the two limits names its source under the rows (reported by the connection's server, the user's override, or a
// guess) beside a door to that connection's limit settings, and a model that thinks says its Max output covers the thinking.
// A reported or overridden ceiling bounds what is typed; a guessed one is passed with a warning, and neither the funnel nor
// the history fit holds a preset's number to a guess (`outputLimitSource`, `windowForPreset`).
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
// Every model-fed control here renders only where the descriptor states it (`statesKnob`, D68). CONTEXT's
// compaction rows are ours, not the model's, and render with no capability; its provider-compression switch and
// all of ADVANCED are the model's, so ADVANCED is absent with no capability or when neither of its controls
// applies. ADVANCED is the deck's ONE collapsed disclosure (genuinely rare escape hatches).
//
// The `<Field>` rows here ride `SettingRowGroup` + `SettingTrackRow` for the reason params-deck.tsx's header
// states (#1770 — `row-void`); what stays OUTSIDE a group is anything that is not a label/control pair:
// the KnobGrids (their own track set), the stop-sequence `Fieldset` (a group, not a row), the compaction
// gloss and the vertical `Summary instructions` textarea.

import type { GenerationCapability, LimitSource, Verbosity, Wire } from "@orb/contracts/inference";
import { contextLimitSource, maxOutputCoversThinking, outputLimitSource, statesKnob } from "@orb/contracts/inference";
import type { EffectiveProvenance } from "@orb/contracts/preset";
import {
  DEFAULT_COMPACT_INSTRUCTIONS,
  DEFAULT_COMPACTION_MODE,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MANAGED_COMPACT_DEFAULT_PCT,
  MANAGED_VERBATIM_TAIL,
} from "@orb/contracts/preset";
import type { UserConnectionId } from "@orb/kit/ids";
import { groupThousands } from "@orb/kit/strings";
import { windowInputRoom } from "@orb/kit/tokens";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { SettingRowGroup, SettingTrackRow } from "#components";
import type { AppFormInstance } from "#forms/editor";
import { CONNECTIONS_LIST_ADDRESS } from "#lib";
import { openConfigTo, requestConnectionEditor } from "#state";
import { pageStep, verbosityLevelsFor } from "../lib/capability-panel-model.ts";
import type { EffectiveKnobRow, EffectiveProfileRow } from "../lib/effective-knobs.ts";
import { SENT_WINDOW_PROVENANCE } from "../lib/effective-knobs.ts";
import type { PresetEditorValues } from "../lib/preset-editor-values.ts";
import {
  PRESET_ADVANCED_NAME,
  PRESET_CONTEXT_LIMIT_NAME,
  PRESET_MAX_CONTEXT_LABEL,
  PRESET_MAX_OUTPUT_LABEL,
  PRESET_OUTPUT_COVERS_THINKING_NOTE,
  PRESET_OUTPUT_LIMIT_NAME,
  PRESET_VERBATIM_TAIL_LABEL,
  presetBlankContextNote,
  presetBlankOutputNote,
  presetCappedOnConnectionNote,
  presetLimitDoorName,
  presetLimitSourceLine,
  presetMaxContextHint,
  presetMaxOutputHint,
  presetPastGuessNote,
  presetReplyExceedsCapNote,
  presetSentWindowHint,
} from "../lib/preset-names.ts";
import { COMPACTION_MODE_ITEMS, compactionModeLabel } from "../lib/preset-nav.ts";
import { SAMPLING_FLAG_LABELS } from "../lib/sampling-knob-catalog.ts";
import { KnobGrid, KnobRow } from "./knob-row.tsx";
import { LogitBiasEditor } from "./logit-bias-editor.tsx";
import { ResponseReplayCluster } from "./response-replay-controls.tsx";
import { BannedPhrases, StopSequences } from "./sequence-chips.tsx";

type AppForm = AppFormInstance<PresetEditorValues>;

export interface ParamsLimitsProps {
  readonly form: AppForm;
  readonly capability: GenerationCapability | undefined;
  readonly effective: EffectiveProfileRow | undefined;
  /** The connection `capability` was resolved on, whose limit settings the Output cluster opens. */
  readonly chatConnectionId: UserConnectionId | undefined;
  /** The wire `capability` was resolved on: whether the reply's cap also covers the model's thinking depends on it. */
  readonly chatWire: Wire | undefined;
}

export function ParamsLimits({ form, capability, effective, chatConnectionId, chatWire }: ParamsLimitsProps): ReactElement {
  return (
    <>
      {/* No capability ⇒ OUTPUT is absent with its two sibling clusters, under the deck's ONE gate note
          (side-eye F-02: three per-cluster notes printed the same sentence three times). */}
      {capability === undefined ? null : (
        <OutputCluster capability={capability} chatConnectionId={chatConnectionId} chatWire={chatWire} effective={effective} form={form} />
      )}
      {effective === undefined ? null : <ResponseReplayCluster effective={effective} form={form} />}
      <ContextCluster capability={capability} form={form} />
      {capability === undefined ? null : <AdvancedCluster capability={capability} form={form} />}
    </>
  );
}

/** OUTPUT (§4 cluster 4) — the two token caps as ghost-armed KnobRows at the model's real ceilings, plus
 *  verbosity and the stop-sequence chips. */
function OutputCluster({
  form,
  capability,
  effective,
  chatConnectionId,
  chatWire,
}: {
  readonly form: AppForm;
  readonly capability: GenerationCapability;
  readonly effective: EffectiveProfileRow | undefined;
  readonly chatConnectionId: UserConnectionId | undefined;
  readonly chatWire: Wire | undefined;
}): ReactElement {
  const outputMax = capability.output.maxTokens.max;
  const window = capability.context.window;
  // On a route that sends the window (Ollama's native `num_ctx`) this knob sets it, so it reaches the trained maximum.
  const contextMax = capability.context.settable?.max ?? window;
  // A ceiling no tier stated is the kind floor's guess; a window the preset itself sends is no guess to correct here.
  const outputSource = outputLimitSource(capability);
  const contextSource = contextLimitSource(capability);
  const outputGuessed = outputSource === "guessed";
  const windowGuessed = contextSource === "guessed";
  const sentByServer = capability.context.settable !== undefined;
  return (
    <Section kicker="Output">
      {/* The two LONGEST names on the deck live here, and the fixed label box clipped both at every pane
          width until the column became a content-sized grid track (side-eye 2026-08-19 P1-1). */}
      <KnobGrid>
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
            <>
              {/* Blank-means-default in STORAGE; the ghost shows what the turn would actually send, and the note
                  says that a blank row sends the app's default however high the model's own limit is. */}
              <KnobRow
                effective={effective?.knobs["maxOutputTokens"]}
                form={form}
                hint={presetMaxOutputHint(groupThousands(outputMax), outputGuessed)}
                label={PRESET_MAX_OUTPUT_LABEL}
                largeStep={pageStep(1, outputMax)}
                max={outputMax}
                min={1}
                name="params.maxOutputTokens"
                note={maxOutputNote(limits.maxOutputTokens, outputMax, outputGuessed, effective?.knobs["maxOutputTokens"])}
                step={1}
                storesPastRail={outputGuessed ? true : undefined}
              />
              <KnobRow
                effective={{ value: window, provenance: capability.context.settable === undefined ? "window" : SENT_WINDOW_PROVENANCE }}
                form={form}
                hint={maxContextHint(
                  capability.context,
                  Math.min(limits.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS, outputMax),
                  limits.maxContextTokens,
                  windowGuessed,
                )}
                label={PRESET_MAX_CONTEXT_LABEL}
                largeStep={pageStep(1, contextMax)}
                max={contextMax}
                min={1}
                name="params.maxContextTokens"
                note={maxContextNote(limits.maxContextTokens, { ceiling: contextMax, window, source: contextSource, sentByServer })}
                step={1}
                storesPastRail={windowGuessed ? true : undefined}
              />
            </>
          )}
        </form.Subscribe>
      </KnobGrid>
      <Stack gap="tight">
        <LimitSourceLine chatConnectionId={chatConnectionId} ceiling={outputMax} name={PRESET_OUTPUT_LIMIT_NAME} source={outputSource} />
        {/* A route that sends the window runs the preset's Max context, so the connection has no window to override. */}
        <LimitSourceLine
          chatConnectionId={sentByServer ? undefined : chatConnectionId}
          ceiling={contextMax}
          name={PRESET_CONTEXT_LIMIT_NAME}
          source={contextSource}
        />
        {chatWire !== undefined && maxOutputCoversThinking(capability, chatWire) ? (
          <Text cap="prose" prose={true} voice="gloss">
            {PRESET_OUTPUT_COVERS_THINKING_NOTE}
          </Text>
        ) : null}
      </Stack>
      <OutputRows capability={capability} form={form} />
      {/* OUTSIDE the row group: these are `Fieldset` GROUPS (N chips plus an add box), not label/control
          rows, so each declares its own block instead of taking the group's label track. */}
      {statesKnob(capability, "stop") ? <StopSequences form={form} /> : null}
      {statesKnob(capability, "bannedStrings") ? <BannedPhrases form={form} /> : null}
    </Section>
  );
}

/** One limit's ceiling, where it comes from, and the door to the connection's own limit settings that can change it. */
function LimitSourceLine({
  name,
  ceiling,
  source,
  chatConnectionId,
}: {
  readonly name: string;
  readonly ceiling: number;
  readonly source: LimitSource;
  readonly chatConnectionId: UserConnectionId | undefined;
}): ReactElement {
  return (
    <Row align="center" gap="field" wrap={true}>
      <Text cap="prose" prose={true} voice="gloss">
        {presetLimitSourceLine(name, groupThousands(ceiling), source)}
      </Text>
      {chatConnectionId === undefined ? null : (
        <Button
          onClick={(): void => {
            openConfigTo(CONNECTIONS_LIST_ADDRESS.group, CONNECTIONS_LIST_ADDRESS.sub);
            requestConnectionEditor(chatConnectionId, { openAdvanced: true });
          }}
          size="sm"
          variant="ghost"
        >
          {presetLimitDoorName(name, source)}
        </Button>
      )}
    </Row>
  );
}

/** OUTPUT's label/control rows: verbosity, reply pictures and the EOS ban, each where the model takes it. */
function OutputRows({ form, capability }: { readonly form: AppForm; readonly capability: GenerationCapability }): ReactElement | null {
  const verbosityLevels = verbosityLevelsFor(capability);
  const pictures = statesKnob(capability, "replyMedia");
  const banEos = statesKnob(capability, "banEos");
  if (verbosityLevels === undefined && !pictures && !banEos) {
    return null;
  }
  return (
    <SettingRowGroup>
      {verbosityLevels === undefined ? null : (
        <SettingTrackRow>
          <form.AppField name="params.verbosity">
            {(field): ReactElement => {
              const value = field.state.value;
              const items: SelectItems = verbosityLevels.map((level) => ({ value: level, label: level }));
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
      {/* Only on a model that can draw. Off clears the field, so a preset that never asked for pictures stores
          nothing. */}
      {pictures ? (
        <SettingTrackRow>
          <form.Subscribe selector={(state): boolean => state.values.params.replyMedia === "text+image"}>
            {(on): ReactElement => (
              <Field hint="Lets the model answer with pictures in the chat as well as text." label="Reply pictures">
                <Switch checked={on} onCheckedChange={(next): void => form.setFieldValue("params.replyMedia", next ? "text+image" : undefined)} />
              </Field>
            )}
          </form.Subscribe>
        </SettingTrackRow>
      ) : null}
      {banEos ? <BanEosRow form={form} /> : null}
    </SettingRowGroup>
  );
}

/** The Max context tokens hint: the model window, the room it leaves for prompt and history once the reply and
 *  the safety margin are held back (the number the chat Preview bar draws), and a warning when the cap leaves no
 *  room beside the reply. On a route that sends the window, the knob sets it rather than capping below it. */
function maxContextHint(
  context: GenerationCapability["context"],
  reserveOutputTokens: number,
  maxContextTokens: number | undefined,
  windowGuessed: boolean,
): string {
  const { window, settable } = context;
  const room = windowInputRoom(window, reserveOutputTokens);
  const base =
    settable === undefined
      ? presetMaxContextHint(groupThousands(window), groupThousands(room), windowGuessed)
      : presetSentWindowHint(groupThousands(settable.max), groupThousands(window));
  return maxContextTokens !== undefined && maxContextTokens <= reserveOutputTokens
    ? `${base} ${presetReplyExceedsCapNote(groupThousands(reserveOutputTokens))}`
    : base;
}

/** Max output tokens' visible line: a blank row names what it sends (the shared default, held under the model's cap as
 *  the funnel holds it); a stored value over the cap keeps its number and says the turn is capped at the connection's stated limit, or
 *  that it passes a guess. */
function maxOutputNote(stored: number | undefined, outputMax: number, guessed: boolean, effective: EffectiveKnobRow | undefined): string | undefined {
  if (stored === undefined) {
    // The note speaks only for the app's default. A quality dial or a model default sets a blank row's value too, and
    // the row's own ghost line names that rung truly, so the note stays out of its way.
    if (effective !== undefined && !BLANK_DEFAULT_RUNGS.has(effective.provenance)) {
      return;
    }
    // The readout's floor rung reports the bare default; the turn materializes it and `resolveChat` then holds it
    // under the model's cap, so the cap bounds what the row says it sends.
    const sends = Math.min(typeof effective?.value === "number" ? effective.value : DEFAULT_MAX_OUTPUT_TOKENS, outputMax);
    return presetBlankOutputNote(groupThousands(sends), groupThousands(DEFAULT_MAX_OUTPUT_TOKENS));
  }
  return cappedNote(stored, outputMax, guessed);
}

/** The funnel rungs a blank Max output row lands on when only the app default stands: the default itself, or that
 *  default held under the model's own cap. */
const BLANK_DEFAULT_RUNGS: ReadonlySet<string> = new Set(["floor", "clamped"] satisfies readonly EffectiveProvenance[]);

/** Max context tokens' visible line: a blank row names what the history is trimmed to; a stored value past this
 *  connection's ceiling says what happens to it. */
function maxContextNote(
  stored: number | undefined,
  limit: { readonly ceiling: number; readonly window: number; readonly source: LimitSource; readonly sentByServer: boolean },
): string | undefined {
  if (stored === undefined) {
    return presetBlankContextNote(groupThousands(limit.window), limit.source, limit.sentByServer);
  }
  return cappedNote(stored, limit.ceiling, limit.source === "guessed");
}

/** A limit row's line for a stored value past this connection's ceiling. The value stays stored as typed; a stated
 *  ceiling caps what is sent and the row says so, while a guessed one is passed and the row warns. */
function cappedNote(stored: number, ceiling: number, guessed: boolean): string | undefined {
  if (stored <= ceiling) {
    return;
  }
  return guessed
    ? presetPastGuessNote(groupThousands(stored), groupThousands(ceiling))
    : presetCappedOnConnectionNote(groupThousands(stored), groupThousands(ceiling));
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

/** CONTEXT (§4 cluster 5) — compaction mode/threshold/instructions (re-homed from the Compaction leaf),
 *  plus the two knobs that had no editor anywhere: `verbatimTail` (G4) and `providerContextCompression`
 *  (G3). Renders with no capability: compaction is our engine's behavior, not the model's. The provider's own
 *  compression is the route's, so it shows only where the route offers it. */
function ContextCluster({ form, capability }: { readonly form: AppForm; readonly capability: GenerationCapability | undefined }): ReactElement {
  return (
    <Section kicker="Context">
      <SettingRowGroup>
        <SettingTrackRow>
          <form.AppField name="params.compaction.mode">
            {(field): ReactElement => (
              <field.SelectField
                hint="Orbweaver can summarize older messages once the chat fills up, and keep that summary even if you switch models. Or the model's own app can handle it. Either way the chat stays within the model's limit."
                items={COMPACTION_MODE_ITEMS}
                label="Summarizing"
                placeholder={`Default: ${compactionModeLabel(DEFAULT_COMPACTION_MODE)}`}
              />
            )}
          </form.AppField>
        </SettingTrackRow>
        <SettingTrackRow>
          <form.AppField name="params.compaction.thresholdPct">
            {(field): ReactElement => (
              <field.NumberField
                hint="Orbweaver summarizes once the chat fills this fraction of the model's limit (0.5–0.99)."
                label="Summarize at"
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
                hint="How many of the newest messages stay word-for-word when Orbweaver summarizes. Everything older goes into the summary."
                label={PRESET_VERBATIM_TAIL_LABEL}
                max={100}
                min={1}
                placeholder={`${MANAGED_VERBATIM_TAIL} (engine default)`}
                step={1}
              />
            )}
          </form.AppField>
        </SettingTrackRow>
        {/* G3: the provider's OWN context compression, where the route offers it. */}
        {capability !== undefined && statesKnob(capability, "providerContextCompression") ? (
          <SettingTrackRow>
            <form.AppField name="params.providerContextCompression">
              {(field): ReactElement => (
                <field.SwitchField hint="Ask the provider to shorten the chat on its side." label="Let the provider shorten the chat" />
              )}
            </form.AppField>
          </SettingTrackRow>
        ) : null}
      </SettingRowGroup>
      {/* HONEST-DEGRADE: the runner's own auto-compaction never exposes its summary, so `auto` stores no
          marker — no carry-forward on a model swap and nothing readable in the transcript. Shown plainly. */}
      <form.Subscribe selector={(state): string | undefined => state.values.params.compaction?.mode}>
        {(mode): ReactElement | null =>
          mode === "auto" ? (
            <Text voice="gloss">
              With the model's own app, you won't get a summary you can read, and nothing carries over if you switch this chat to another model. Choose
              Orbweaver to keep a summary you can read and take with you.
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

/** ADVANCED (§4 cluster 6) — the deck's ONE collapsed disclosure: the genuinely rare escape hatches, each where
 *  the model takes it. Absent when neither applies. */
function AdvancedCluster({ form, capability }: { readonly form: AppForm; readonly capability: GenerationCapability }): ReactElement | null {
  const bias = statesKnob(capability, "logitBias");
  const parallel = statesKnob(capability, "parallelToolCalls");
  if (!(bias || parallel)) {
    return null;
  }
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
          stylesheet order). The trigger is `inline-flex`, so the box grows
          around the word rather than claiming the row's width. */}
      <CollapsibleTrigger size="control">
        <Text voice="label">{PRESET_ADVANCED_NAME}</Text>
      </CollapsibleTrigger>
      <CollapsiblePanel offset="row">
        <Stack gap="field">
          {bias ? <LogitBiasEditor form={form} /> : null}
          {parallel ? (
            <SettingRowGroup>
              <SettingTrackRow>
                {/* Unset is the model's own default, which allows parallel calls on every wire that has the control, so
                    the switch reads on until the preset stores `false`. Off writes `false`; on clears the field. */}
                <form.Subscribe selector={(state): boolean => state.values.params.advanced?.parallelToolCalls !== false}>
                  {(on): ReactElement => (
                    <Field hint="Let the model emit several tool calls in one turn. Turn it off to ask for one call at a time." label="Parallel tool calls">
                      <Switch
                        checked={on}
                        onCheckedChange={(next): void => form.setFieldValue("params.advanced.parallelToolCalls", next ? undefined : false)}
                      />
                    </Field>
                  )}
                </form.Subscribe>
              </SettingTrackRow>
            </SettingRowGroup>
          ) : null}
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}
