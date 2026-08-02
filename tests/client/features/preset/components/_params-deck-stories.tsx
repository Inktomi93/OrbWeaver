// CT story module for the PARAMS DECK (preset-surface-redesign.md §4). A CT only mounts from a NON-test
// module (Spine-Testing §7). Every story wires the REAL deck through the SAME `createAutosaveEntityForm`
// session BOUNDARY the production editor mounts it under (the §14.1 form-factory mandate — production-
// faithful, not a lighter double) over a real save spy.
//
// THE SAVE SPY IS THE KEY-MINIMAL PROOF. `preset.update` carries the WHOLE config, so "this edit wrote only
// that knob" is asserted as: the params keys present in the last SAVED value. The ghost is DISPLAY (it comes
// from the resolver and is never written back) — the macro-gate's data-flow blind spot is exactly this
// hazard, so the `<output>` mirrors the saved key set, not just one field.

import type { AppFormInstance } from "@orb/client/forms";
import { createAutosaveEntityForm } from "@orb/client/forms";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ReactElement } from "react";
import { useState } from "react";
import { ParamsDeck } from "../../../../../packages/client/src/features/preset/components/params-deck";
import { makeModelCapability } from "../../../../support/factories/resolved-connection";

const STORY_PRESET = "preset_deckstoryaaaa";

// A vLLM-shaped capability: the sampling knobs the deck rows render (incl. `topA`, G1's new row), a seed
// flag, stop-sequence support, an 8192 output cap and a 32768 window — the two ceilings the OUTPUT rows
// clamp against. Built through the TYPED factory (schema-parsed, browser-safe) — no fabrication cast.
const STORY_CAPABILITY = makeModelCapability({
  sampling: {
    temperature: { min: 0, max: 2 },
    topP: { min: 0, max: 1 },
    minP: { min: 0, max: 1 },
    topA: { min: 0, max: 1 },
    repetitionPenalty: { min: 0, max: 2 },
    seed: true,
    stop: true,
  },
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 32_768 },
});

// The funnel's projection (`preset.resolveEffective`) for a preset with NOTHING explicit: top-p resolves
// from the model default and max-output falls to the engine FLOOR. Nothing here is a client derivation —
// the deck renders exactly what the read reports, which is the whole point of D5.
const GHOST_EFFECTIVE = {
  model: "qwen3-32b",
  knobs: {
    topP: { value: 0.92, provenance: "modelDefault" },
    maxOutputTokens: { value: 2048, provenance: "floor" },
  },
  stale: [],
  // No dial set on this fixture, so the server reports no mapping (side-eye F-15's datum).
  qualityMapping: null,
};

// The same preset on `quality: deep` with an explicit, OVER-RANGE repetition penalty: temperature now comes
// from the DIAL (the rung the mapping gloss reads) and the penalty was CLAMPED to the model's max.
const EXPLICIT_EFFECTIVE = {
  model: "qwen3-32b",
  knobs: {
    temperature: { value: 1, provenance: "quality" },
    topP: { value: 0.92, provenance: "modelDefault" },
    repetitionPenalty: { value: 2, provenance: "clamped" },
    maxOutputTokens: { value: 2048, provenance: "floor" },
  },
  stale: [],
  // The DIAL's own declared mapping, as `preset.resolveEffective` projects it — never a client re-mapping,
  // and true even though `temperature` is currently overridden (the F-15 distinction).
  qualityMapping: {
    quality: "deep",
    entries: [
      { knob: "effort", value: "high" },
      { knob: "temperature", value: 1 },
    ],
  },
};

// A stored `topA` this model does not honor — the funnel drops it, so it is invisible in both directions
// until the staleness row names it (F7).
const STALE_EFFECTIVE = {
  ...GHOST_EFFECTIVE,
  stale: [{ knob: "topA", value: 0.2 }],
};

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** The deck over a BLANK params blob — every knob inherited, so the ghost column is what renders. */
export function ParamsDeckGhostStory(): ReactElement {
  return <DeckHarness effective={GHOST_EFFECTIVE} params={{}} />;
}

/** The deck with an EXPLICIT repetition penalty the model clamps + a `quality` dial — the clamp gloss and
 *  the quality-mapping gloss both come off the resolver, never a client re-derivation. */
export function ParamsDeckExplicitStory(): ReactElement {
  return <DeckHarness effective={EXPLICIT_EFFECTIVE} params={{ quality: "deep", repetitionPenalty: 2.5 }} />;
}

/** The deck with a STORED-BUT-UNHONORED knob — the §4.2 staleness row (F7). */
export function ParamsDeckStaleStory(): ReactElement {
  return <DeckHarness effective={STALE_EFFECTIVE} params={{ topA: 0.2 }} />;
}

/** The deck with NO capability — the ONE connect-a-model note, with QUALITY/CONTEXT/ADVANCED still live. */
export function ParamsDeckNoModelStory(): ReactElement {
  return <DeckHarness capability={null} effective={undefined} params={{}} />;
}

/** The deck whose capability read FAILED (side-eye F-02): a different problem from "no model configured",
 *  and the server's own reason is the only honest thing to show. */
export function ParamsDeckCapabilityErrorStory(): ReactElement {
  return <DeckHarness capability={null} capabilityError="400 incoherent routing (agent-sdk × local-light)" effective={undefined} params={{}} />;
}

/** The deck carrying a server-only `customParameters` blob — D7's read-only presence row in ADVANCED. */
export function ParamsDeckCustomParamsStory(): ReactElement {
  return <DeckHarness customParameterKeys={["top_a", "repetition_penalty"]} effective={GHOST_EFFECTIVE} params={{}} />;
}

interface DeckHarnessProps {
  readonly params: PromptConfig["params"];
  readonly effective: Parameters<typeof ParamsDeck>[0]["effective"];
  /** `null` = the no-model arm. A defaulted `undefined` would silently fall back to the story capability,
   *  which is exactly the mistake that made the gate story render a model's knobs. */
  readonly capability?: Parameters<typeof ParamsDeck>[0]["capability"] | null;
  readonly customParameterKeys?: readonly string[];
  /** The capability read's FAILURE message — distinct from "no model configured" (side-eye F-02). */
  readonly capabilityError?: string | null;
}

/** The shared harness: the REAL deck under the REAL autosave boundary, with the last-saved params KEY SET
 *  mirrored to an `<output>` (the key-minimal patch proof) plus the last-saved value of each knob. */
function DeckHarness({ params, effective, capability = STORY_CAPABILITY, customParameterKeys = [], capabilityError = null }: DeckHarnessProps): ReactElement {
  const resolvedCapability = capability ?? undefined;
  const [saved, setSaved] = useState("keys=- ");
  const save = (values: PromptConfig): Promise<void> => {
    const entries = Object.entries(values.params).filter(([, value]) => value !== undefined);
    const keys = entries.map(([key]) => key).sort();
    const pairs = entries.map(([key, value]) => `${key}:${JSON.stringify(value)}`).sort();
    setSaved(`keys=${keys.join(",")} values=${pairs.join(",")}`);
    return Promise.resolve();
  };
  return (
    <StoryForm entityId={STORY_PRESET} save={save} serverValues={{ ...DEFAULT_PROMPT_CONFIG, params }}>
      {(session): ReactElement => (
        <>
          <output>{saved}</output>
          <ParamsDeck
            capability={resolvedCapability}
            capabilityError={capabilityError}
            customParameterKeys={customParameterKeys}
            effective={effective}
            form={session.form as AppFormInstance<PromptConfig>}
          />
        </>
      )}
    </StoryForm>
  );
}
