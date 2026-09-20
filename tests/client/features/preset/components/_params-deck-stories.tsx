// CT story module for the PARAMS DECK (preset-surface-redesign.md §4). A CT only mounts from a NON-test
// module (Spine-Testing §7). Every story wires the REAL deck through the SAME `createAutosaveEntityForm`
// session BOUNDARY the production editor mounts it under (the §14.1 form-factory mandate — production-
// faithful, not a lighter double) over a real save spy.
//
// THE SAVE SPY IS THE KEY-MINIMAL PROOF. `preset.update` carries the WHOLE config, so "this edit wrote only
// that knob" is asserted as: the params keys present in the last SAVED value. The ghost is DISPLAY (it comes
// from the resolver and is never written back) — the macro-gate's data-flow blind spot is exactly this
// hazard, so the `<output>` mirrors the saved key set, not just one field.

import type { AppFormInstance } from "@orb/client/forms/editor";
import { AutosaveStatus, createAutosaveEntityForm } from "@orb/client/forms/editor";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { ParamsDeck } from "../../../../../packages/client/src/features/preset/components/params-deck.tsx";
import { validatePresetConfig } from "../../../../../packages/client/src/features/preset/lib/preset-editor-model.ts";
import type { ReadFailure } from "../../../../../packages/client/src/features/preset/lib/resolve-failure.ts";
import { makeGenerationCapability } from "../../../../support/factories/resolved-connection.ts";

const STORY_PRESET = "preset_deckstoryaaaa";

// A vLLM-shaped capability: the sampling knobs the deck rows render (incl. `topA`, G1's new row), a seed
// flag, stop-sequence support, an 8192 output cap and a 32768 window — the two ceilings the OUTPUT rows
// clamp against. Built through the TYPED factory (schema-parsed, browser-safe) — no fabrication cast.
const STORY_CAPABILITY = makeGenerationCapability({
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

// The PRODUCTION validator is mounted here, not omitted: the escape-hatch editor's saved-truth arm is a
// claim about the fold `form.state.isValid` drives, so a story without it could not fail.
const StoryForm = createAutosaveEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
  options: {
    validators: {
      onDynamic: ({ value }: { value: PromptConfig }): { fields: Record<string, string> } | undefined => validatePresetConfig(value),
    },
  },
});

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

/** The deck while the capability read is still PENDING (no descriptor, no error) — the gate's skeleton arm,
 *  with QUALITY/CONTEXT/ADVANCED still live. This used to be the "no model" story, but a settled read with no
 *  descriptor does not exist: `connection.resolveChatCapability` returns a REQUIRED descriptor or throws, so
 *  this input pair is reachable ONLY in flight (see `capability-gate.tsx`'s header). */
export function ParamsDeckPendingCapabilityStory(): ReactElement {
  return <DeckHarness capability={null} effective={undefined} params={{}} />;
}

/** A thrown read shaped the way the tRPC CLIENT hands one to a caller: the message plus the structured
 *  `data.code` the server's DomainError→code mapper produced (the `ReadFailure` shape the band's prop takes —
 *  `useQuery().error` is a `TRPCClientErrorLike`, a structural interface, not an `Error` subtype tsc accepts).
 *  The gate discriminates on that code, so the stories below differ ONLY in it. */
function readError(code: string | undefined, message: string): ReadFailure {
  return code === undefined ? { message } : { message, data: { code } };
}

/** The deck whose capability read FAILED with the ROUTING refusal `assertCoherent` throws — a `BAD_REQUEST`,
 *  which is the ONE code that EARNS the "routing problem, not a missing connection" verdict (side-eye F-02).
 *  The server's own reason is quoted verbatim. */
export function ParamsDeckCapabilityErrorStory(): ReactElement {
  return (
    <DeckHarness
      capability={null}
      capabilityError={readError("BAD_REQUEST", "400 incoherent routing (agent-sdk × local-light)")}
      effective={undefined}
      params={{}}
    />
  );
}

/** The deck whose capability read failed with a NON-ROUTING code — here `PRECONDITION_FAILED`, standing for
 *  the whole class the gate must not editorialise over. What is reachable at THIS verb is a settings/user
 *  read failing or a 500: `connection.resolveChatCapability` is deliberately CREDENTIAL-FREE (it reads the
 *  static descriptor as authoritative — `domain/connection/verbs/resolve-role.ts`), so the "missing
 *  credential" this arm was first written around cannot occur here at all.
 *
 *  The pin is the CLASS, not the code: the old gate asserted "this is a routing problem, NOT a missing
 *  connection" over every failure alike, so an error that names no routing fault got told what its cause was
 *  — the exact wrong-confident-cause defect `lib/resolve-failure.ts` was minted to kill. Both the verdict and
 *  the HEADLINE must fall back to naming the READ. */
export function ParamsDeckCapabilityNonRoutingStory(): ReactElement {
  return (
    <DeckHarness
      capability={null}
      capabilityError={readError("PRECONDITION_FAILED", "the routing settings could not be read")}
      effective={undefined}
      params={{}}
    />
  );
}

/** The deck whose capability read failed with NO tRPC `data` at all — a dropped socket / a 500. The band knows
 *  the read failed and nothing more, so it may name no cause in EITHER line. */
export function ParamsDeckCapabilityTransportFailureStory(): ReactElement {
  return <DeckHarness capability={null} capabilityError={readError(undefined, "Failed to fetch")} effective={undefined} params={{}} />;
}

/** The deck carrying a stored `customParameters` blob — the ADVANCED editor's populated arm (D143a). One
 *  plain sampler key and one BELT-OWNED key, so the per-row drop warning has a subject. */
export function ParamsDeckCustomParamsStory(): ReactElement {
  // Built from PAIRS: the keys are provider wire names (snake_case), which an object literal would put
  // through the camelCase naming rule.
  const stored = Object.fromEntries([
    ["dry_multiplier", 0.8],
    ["stream", false],
  ]);
  return <DeckHarness customParameters={stored} effective={GHOST_EFFECTIVE} params={{}} />;
}

/** The deck with NO stored blob — the editor's empty arm, where Add is the only affordance. */
export function ParamsDeckNoCustomParamsStory(): ReactElement {
  return <DeckHarness effective={GHOST_EFFECTIVE} params={{}} />;
}

interface DeckHarnessProps {
  readonly params: PromptConfig["params"];
  readonly effective: Parameters<typeof ParamsDeck>[0]["effective"];
  /** `null` = the no-model arm. A defaulted `undefined` would silently fall back to the story capability,
   *  which is exactly the mistake that made the gate story render a model's knobs. */
  readonly capability?: Parameters<typeof ParamsDeck>[0]["capability"] | null;
  /** The stored escape-hatch blob the ADVANCED editor seeds from. */
  readonly customParameters?: PromptConfig["customParameters"];
  /** The capability read's THROWN error — passed WHOLE so the gate reads `data.code` (side-eye F-02 + the
   *  2026-08-08 earned-cause fix). `null` = PENDING. */
  readonly capabilityError?: ReadFailure | null;
}

/** The shared harness: the REAL deck under the REAL autosave boundary, with the last-saved params KEY SET
 *  mirrored to an `<output>` (the key-minimal patch proof) plus the last-saved value of each knob, and the
 *  escape-hatch blob as it was actually written. The header's REAL `AutosaveStatus` rides along: the
 *  editor's saved-truth arm is a claim about what that affordance says, so the story must render it rather
 *  than a stand-in. */
function DeckHarness({ params, effective, capability = STORY_CAPABILITY, customParameters, capabilityError = null }: DeckHarnessProps): ReactElement {
  const resolvedCapability = capability ?? undefined;
  const [saved, setSaved] = useState("keys=- ");
  const save = (values: PromptConfig): Promise<void> => {
    const entries = Object.entries(values.params).filter(([, value]) => value !== undefined);
    const keys = entries.map(([key]) => key).sort();
    const pairs = entries.map(([key, value]) => `${key}:${JSON.stringify(value)}`).sort();
    setSaved(`keys=${keys.join(",")} values=${pairs.join(",")} custom=${JSON.stringify(values.customParameters ?? null)}`);
    return Promise.resolve();
  };
  const serverValues: PromptConfig = { ...DEFAULT_PROMPT_CONFIG, params, ...(customParameters === undefined ? {} : { customParameters }) };
  return (
    <StoryForm entityId={STORY_PRESET} save={save} serverValues={serverValues}>
      {(session): ReactElement => (
        <>
          <output>{saved}</output>
          <AutosaveStatus onRetry={session.retrySave} state={session.saveState} />
          {/* THE `@container` IS PRODUCTION, NOT SCAFFOLDING: the editor mounts every view body inside one
              (`preset-editor-surface.tsx`), and the KnobRow's narrow fold is a CONTAINER query. A story that
              omits it has no query root at all, so the fold would resolve to its default arm at every width
              and the width matrix would be measuring nothing. */}
          <Container className="w-full">
            <ParamsDeck
              capability={resolvedCapability}
              capabilityError={capabilityError}
              effective={effective}
              form={session.form as AppFormInstance<PromptConfig>}
            />
          </Container>
        </>
      )}
    </StoryForm>
  );
}

/** THE PRESET RESET AS THE FORM PERFORMS IT (#1520 item 1) — a clean SERVER-ECHO reseed, which is a
 *  different path from an entity SWITCH and the whole reason the defect existed. A switch bumps the
 *  boundary's remount key and the editor reseeds for free; a reset arrives as new `serverValues` on the
 *  STILL-MOUNTED form, which `create-autosave-entity-form.tsx` pushes in with `form.setFieldValue` field by
 *  field, remounting nothing. The button swaps the stored blob to model exactly that. */
export function ParamsDeckCustomParamsResetStory(): ReactElement {
  const [reset, setReset] = useState(false);
  // Built from PAIRS for the same reason the sibling story is: these keys are provider wire names.
  const before = Object.fromEntries([
    ["dry_multiplier", 0.8],
    ["stream", false],
  ]);
  const after = Object.fromEntries([["top_a", 0.1]]);
  return (
    <>
      <button onClick={(): void => setReset(true)} type="button">
        Reset the preset
      </button>
      {/* The RESET'S OWN LANDING MARKER (#1588). The three reseed fences assert that something did NOT
          happen, so they need a positive signal that the new `serverValues` actually reached the form —
          otherwise they are asserting against a reset that had not been delivered yet, which is a sleep
          wearing a barrier's clothes. This node mounts on the SAME commit that hands the new blob down. */}
      {reset ? <p data-testid="params-deck-reset-applied">reset applied</p> : null}
      <DeckHarness customParameters={reset ? after : before} effective={GHOST_EFFECTIVE} params={{}} />
    </>
  );
}

/** A LOGIT-BIAS map that CHANGES on a still-mounted form — #1502's own case, and the property the blur epoch
 *  must not have weakened: the box belongs to the preset, so a switch REPLACES its text rather than leaving
 *  the previous preset's JSON sitting there for the next blur to write back. Same reseed path as the
 *  custom-parameters story above (new `serverValues`, no remount key bump), because that is what a preset
 *  switch does to this subtree. */
export function ParamsDeckLogitBiasSwitchStory(): ReactElement {
  const [switched, setSwitched] = useState(false);
  return (
    <>
      <button onClick={(): void => setSwitched(true)} type="button">
        Switch the preset
      </button>
      <DeckHarness effective={GHOST_EFFECTIVE} params={{ logitBias: switched ? { "9": -10 } : { "7": 50 } }} />
    </>
  );
}
