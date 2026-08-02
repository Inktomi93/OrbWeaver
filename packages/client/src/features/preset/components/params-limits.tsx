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

import type { ModelCapability, Verbosity } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_COMPACTION_MODE, MANAGED_COMPACT_DEFAULT_PCT, MANAGED_VERBATIM_TAIL } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Field, FieldLayout } from "@orb/ui/field";
import { Icon, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { pageStep, verbosityLevelsFor } from "../lib/capability-panel-model";
import type { EffectiveProfileRow } from "../lib/effective-knobs";
import { COMPACTION_MODE_ITEMS, compactionModeLabel } from "../lib/preset-nav";
import { KnobRow } from "./knob-row";

type AppForm = AppFormInstance<PromptConfig>;

export interface ParamsLimitsProps {
  readonly form: AppForm;
  readonly capability: ModelCapability | undefined;
  readonly effective: EffectiveProfileRow | undefined;
  readonly customParameterKeys: readonly string[];
}

const DYNAMIC_CONTEXT_ITEMS: SelectItems<string> = [
  { value: "", label: "Auto (model-appropriate)" },
  { value: "system", label: "Join into the cached system prompt" },
  { value: "hook", label: "Deliver at the message tail (cache-safe)" },
];

export function ParamsLimits({ form, capability, effective, customParameterKeys }: ParamsLimitsProps): ReactElement {
  return (
    <>
      {/* No capability ⇒ OUTPUT is absent with its two sibling clusters, under the deck's ONE gate note
          (side-eye F-02: three per-cluster notes printed the same sentence three times). */}
      {capability === undefined ? null : <OutputCluster capability={capability} effective={effective} form={form} />}
      <ContextCluster form={form} />
      <AdvancedCluster customParameterKeys={customParameterKeys} form={form} />
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
      <Stack gap="tight">
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
      </Stack>
      <FieldLayout orientation="horizontal">
        {verbosityLevels === undefined ? null : (
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
        )}
        {capability.sampling.stop === true ? <StopSequences form={form} /> : null}
      </FieldLayout>
    </Section>
  );
}

/** G2 — the `params.stop` chip list. No chip-input primitive exists in the seal and none is needed: Badge
 *  chips + a ghost × + an add Input is the landed tag-chip anatomy. */
function StopSequences({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <form.AppField name="params.stop">
      {(field): ReactElement => {
        const stops = (field.state.value as readonly string[] | undefined) ?? [];
        const add = (event: KeyboardEvent<HTMLInputElement>): void => {
          if (event.key !== "Enter") {
            return;
          }
          event.preventDefault();
          const input = event.currentTarget;
          const next = input.value;
          if (next === "" || stops.includes(next)) {
            return;
          }
          field.handleChange([...stops, next]);
          input.value = "";
        };
        // HINT, not `description` (crunch-list 21): a Field description renders at the 13px/muted step,
        // which is a FIFTH type tuple on a deck whose helper voice is `gloss`. The deck's one helper voice
        // is the gloss; explanatory prose rides the hover hint (§4.1's rule), which is what every other row
        // here already does.
        return (
          <Field hint="The model stops generating when it would emit one of these. Type a sequence and press Enter." label="Stop sequences" name={field.name}>
            <Row className="flex-wrap" gap="field">
              {stops.map((stop) => (
                <Badge intent="neutral" key={stop} size="sm" tone="soft">
                  {stop}
                  <Button
                    aria-label={`Remove stop sequence ${stop}`}
                    intent="ghost"
                    onClick={(): void => field.handleChange(stops.filter((s) => s !== stop))}
                    size="icon"
                    type="button"
                  >
                    <Icon icon={X} size="xs" />
                  </Button>
                </Badge>
              ))}
              <Input aria-label="Add stop sequence" onKeyDown={add} placeholder="add…" />
            </Row>
          </Field>
        );
      }}
    </form.AppField>
  );
}

/** CONTEXT (§4 cluster 5) — compaction mode/threshold/instructions (re-homed from the Compaction leaf),
 *  plus the two knobs that had no editor anywhere: `verbatimTail` (G4) and `providerContextCompression`
 *  (G3). Renders with no capability: this is our engine's behavior, not the model's. */
function ContextCluster({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <Section kicker="Context">
      <FieldLayout orientation="horizontal">
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
        {/* G4: the "missing 4th compaction knob" — minted on the schema, never given an editor. */}
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
        {/* G3: the provider's OWN context compression — honest per-backend gloss, since only some honor it. */}
        <form.AppField name="params.providerContextCompression">
          {(field): ReactElement => (
            <field.SwitchField
              hint="Ask the provider to compress context on its side. Only backends that advertise it honor this; the rest ignore it silently."
              label="Provider context compression"
            />
          )}
        </form.AppField>
      </FieldLayout>
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
          <field.TextareaField hint="How to steer the summary (leave blank for the RP-tuned default)." label="Summary instructions" rows={3} />
        )}
      </form.AppField>
    </Section>
  );
}

/** ADVANCED (§4 cluster 6) — the deck's ONE collapsed disclosure: the genuinely rare escape hatches. */
function AdvancedCluster({ form, customParameterKeys }: { readonly form: AppForm; readonly customParameterKeys: readonly string[] }): ReactElement {
  return (
    <Collapsible>
      <CollapsibleTrigger>
        <Text voice="kicker">Advanced</Text>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="field">
          <form.Subscribe selector={(state): Record<string, number> | undefined => state.values.params.logitBias}>
            {(logitBias): ReactElement => (
              <Field hint="A JSON map of token id → bias (-100…100). Nudges or blocks specific tokens. Invalid JSON is ignored." label="Logit bias">
                <Textarea
                  aria-label="Logit bias"
                  defaultValue={logitBias === undefined ? "" : JSON.stringify(logitBias)}
                  onBlur={(e): void => form.setFieldValue("params.logitBias", parseLogitBias(e.target.value))}
                  rows={3}
                />
              </Field>
            )}
          </form.Subscribe>
          <FieldLayout orientation="horizontal">
            <form.Subscribe selector={(state): boolean => state.values.params.advanced?.parallelToolCalls === true}>
              {(parallel): ReactElement => (
                <Field hint="Let the model emit several tool calls in one turn." label="Parallel tool calls">
                  <Switch
                    aria-label="Parallel tool calls"
                    checked={parallel}
                    onCheckedChange={(on): void => form.setFieldValue("params.advanced.parallelToolCalls", on ? true : undefined)}
                  />
                </Field>
              )}
            </form.Subscribe>
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
          </FieldLayout>
          <CustomParametersRow keys={customParameterKeys} />
          <Text voice="gloss">
            `advanced.claudeEnv` is deliberately editor-less — it is a config-tier escape hatch for the agent-sdk process environment, not a generation knob.
          </Text>
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** D7 — the read-only presence row for `customParameters`: a server-only custom-BYO passthrough that
 *  CHANGES THE WIRE. Editing stays out (it is the BYOK escape hatch by design), but an invisible stored
 *  blob that alters generation fails the no-silent-knobs bar. */
function CustomParametersRow({ keys }: { readonly keys: readonly string[] }): ReactElement {
  if (keys.length === 0) {
    return <Text voice="gloss">No custom parameters are stored on this preset.</Text>;
  }
  return (
    <Row align="center" gap="field">
      <Text voice="label">Custom parameters</Text>
      <Text voice="datum">{keys.join(" · ")}</Text>
      <Text voice="gloss">sent verbatim by custom-BYO backends only; OpenRouter drops them</Text>
    </Row>
  );
}

/** Parse the logit-bias JSON textarea → a `Record<string, number>` (or `undefined` on empty/invalid — the
 *  escape hatch never crashes the form; the server re-validates via `userIntentSchema`). */
function parseLogitBias(raw: string): Record<string, number> | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return;
  }
  let parsed: unknown;
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
