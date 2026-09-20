// verb: resolveEffective — the generation funnel PROJECTED for the editor (redesign §4.3 / D5, F9). The deck
// must show what the NEXT TURN WILL ACTUALLY SEND, and the funnel resolves server-side; before this verb the
// editor had no honest source for it and the quality-fed defaults were invisible.
//
// ONE HOME, TWO CONSUMERS: the value of every knob below comes from `resolveChat(params, capability)` —
// literally the function both sealed chat runners call once per turn (`infra/providers/resolve-chat`). This
// verb resolves NO policy of its own: it runs that call and LABELS each result by comparing it against what
// the preset stored and what the quality dial would have supplied. `QUALITY_SAMPLING`/`QUALITY_EFFORT` are
// read for the LABEL only (which rung produced the value the funnel already returned), never to compute one —
// a re-derivation here is exactly the drift `capability-panel-model.ts` bans on the client.
//
// Read-only: no write, no audit, no event.

import type { GenerationCapability } from "@orb/contracts/inference";
import { requireGenerationCapability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_MAX_OUTPUT_TOKENS, parsePromptConfig, QUALITY_EFFORT, QUALITY_SAMPLING } from "@orb/contracts/preset";
import type { ResolvedChatKnobs } from "@orb/inference";
import { resolveChat } from "@orb/inference";
import type { PresetContext } from "../context.ts";
import { PresetNotFoundError } from "../contract/errors.ts";
import type { ResolveEffectiveParams } from "../contract/params.ts";
import type { PresetService } from "../contract/service.ts";
import type {
  EffectiveKnob,
  EffectiveKnobReading,
  EffectivePreset,
  EffectiveProvenance,
  QualityMapping,
  QualityMappingEntry,
  StaleKnob,
} from "../contract/views.ts";
import { EFFECTIVE_KNOBS } from "../contract/views.ts";
import { readablePreset } from "../persistence/queries.ts";

/** The user-intent effort value that means "reasoning off" — the one string the funnel treats as a disable
 *  rather than a level (`resolve-chat`'s `EFFORT_OFF`). */
const EFFORT_OFF = "none";

/** What the projection knows about ONE knob: the three rungs it compares, plus the documented engine floor
 *  that stands when the funnel itself produces nothing. */
interface KnobProbe {
  /** The value the PRESET stored for this knob (undefined ⇒ inherit). */
  readonly explicit?: number | string | undefined;
  /** What the quality dial would supply for this knob when nothing is explicit (undefined ⇒ the dial has no
   *  opinion on it — today only `temperature` and `effort` are dialed). */
  readonly quality?: number | string | undefined;
  /** What the FUNNEL returned. The only source of a rendered value. */
  readonly resolved?: number | string | undefined;
  /** The engine floor a knob falls back to when the funnel emits nothing for it — a real constant the wire
   *  reads downstream, never an invented number. */
  readonly floor?: number | undefined;
}

/** The effective EFFORT the funnel landed on. Reasoning collapses several surfaces into one decision:
 *  reasoning OFF is itself the effective effort `none` (not an absent knob, and not staleness), while in
 *  `budget` mode there is no effort at all — the model takes a token budget instead of a level.
 *
 *  A model that CANNOT REASON AT ALL (`reasoning.mode === "none"`) has no effort knob to report: emitting
 *  `none` there gave the dial's `high` something to be "clamped" from, so the readout printed
 *  `effort · none · clamped` on a model where nothing was clamped and the knob does not exist (side-eye
 *  F-14). The absence is the honest answer — the same doctrine the deck already applies to an unlisted
 *  sampling knob. */
function resolvedEffortOf(reasoning: ResolvedChatKnobs["reasoning"], capability: GenerationCapability): string | undefined {
  if (capability.reasoning.mode === "none") {
    return;
  }
  if (!reasoning.enabled) {
    return EFFORT_OFF;
  }
  return reasoning.mode === "budget" ? undefined : reasoning.effort;
}

/** The QUALITY dial's DECLARED mapping (redesign §4 cluster 1) — read straight off the dial's own tables,
 *  never off the funnel's output: "what does deep do" stays true even when every knob it feeds is
 *  explicitly overridden below. A knob THIS MODEL cannot take is left out (the same F-14 honesty as the
 *  effort reading above — the mapping may not name a knob the deck refuses to render). `null` with no dial
 *  set, and with an EMPTY entry list, because "deep →" with nothing after it is not a datum. */
function qualityMappingOf(quality: UserIntent["quality"], capability: GenerationCapability): QualityMapping | null {
  if (quality === undefined) {
    return null;
  }
  const entries: QualityMappingEntry[] = [];
  if (capability.reasoning.mode !== "none") {
    entries.push({ knob: "effort", value: QUALITY_EFFORT[quality] });
  }
  const temperature = QUALITY_SAMPLING[quality].temperature;
  if (temperature !== undefined && capability.sampling.temperature !== undefined) {
    entries.push({ knob: "temperature", value: temperature });
  }
  return entries.length === 0 ? null : { quality, entries };
}

/** WHICH rung produced the funnel's value. A value that differs from what was asked for was moved by the
 *  capability clamp, and says so — that is the whole point of showing provenance. */
function provenanceOf(probe: KnobProbe, resolved: number | string): EffectiveProvenance {
  if (probe.explicit !== undefined) {
    return probe.explicit === resolved ? "explicit" : "clamped";
  }
  if (probe.quality !== undefined) {
    return probe.quality === resolved ? "quality" : "clamped";
  }
  return "modelDefault";
}

/** The per-knob probe table. EXHAUSTIVE over `EFFECTIVE_KNOBS` (a `Record`, not a switch — house dispatch
 *  discipline): a new knob in the tuple fails `tsc` here until it names its three rungs. */
function probeKnobs(params: UserIntent, capability: GenerationCapability): Record<EffectiveKnob, KnobProbe> {
  const resolved = resolveChat(params, capability);
  const { sampling, reasoning } = resolved;
  const quality = params.quality;
  // Safe to index: `params` reached here through `parsePromptConfig`, whose `.catch({})` drops the WHOLE
  // params blob when any field (quality included) fails its enum — so a stored garbage dial can never index.
  const qualityTemperature = quality !== undefined ? QUALITY_SAMPLING[quality].temperature : undefined;
  const qualityEffort = quality !== undefined ? QUALITY_EFFORT[quality] : undefined;
  const effortResolved = resolvedEffortOf(reasoning, capability);
  return {
    temperature: { explicit: params.temperature, quality: qualityTemperature, resolved: sampling.temperature },
    topP: { explicit: params.topP, resolved: sampling.topP },
    topK: { explicit: params.topK, resolved: sampling.topK },
    minP: { explicit: params.minP, resolved: sampling.minP },
    topA: { explicit: params.topA, resolved: sampling.topA },
    frequencyPenalty: { explicit: params.frequencyPenalty, resolved: sampling.frequencyPenalty },
    presencePenalty: { explicit: params.presencePenalty, resolved: sampling.presencePenalty },
    repetitionPenalty: { explicit: params.repetitionPenalty, resolved: sampling.repetitionPenalty },
    seed: { explicit: params.seed, resolved: sampling.seed },
    effort: { explicit: params.effort, quality: qualityEffort, resolved: effortResolved },
    thinkingBudgetTokens: {
      explicit: params.thinkingBudgetTokens,
      resolved: reasoning.enabled && reasoning.mode === "budget" ? reasoning.budgetTokens : undefined,
    },
    thinkingDisplay: { explicit: params.thinkingDisplay, resolved: reasoning.display },
    // The funnel clamps an EXPLICIT output cap and otherwise emits nothing — the reserve/wire fallback is
    // `DEFAULT_MAX_OUTPUT_TOKENS`, the ONE constant both the budget reserve and every runner's `max_tokens`
    // read. That is the "floor" rung, and it is what the ghost row must show when the knob is unset.
    maxOutputTokens: { explicit: params.maxOutputTokens, resolved: resolved.maxOutputTokens, floor: DEFAULT_MAX_OUTPUT_TOKENS },
    verbosity: { explicit: params.verbosity, resolved: resolved.verbosity },
  };
}

export function createResolveEffective(ctx: PresetContext): Pick<PresetService, "resolveEffective"> {
  async function resolveEffective(params: ResolveEffectiveParams): Promise<EffectivePreset> {
    const row = await readablePreset(ctx.db, params.principal.userId, params.id);
    if (row === undefined) {
      throw new PresetNotFoundError(params.id);
    }
    const resolved = await ctx.resolveChatCapability({ principal: params.principal });
    const { model } = resolved;
    const capability = requireGenerationCapability(resolved.capability);
    const intent = parsePromptConfig(row.config).params;
    const probes = probeKnobs(intent, capability);

    const knobs: Partial<Record<EffectiveKnob, EffectiveKnobReading>> = {};
    const stale: StaleKnob[] = [];
    for (const knob of EFFECTIVE_KNOBS) {
      const probe = probes[knob];
      if (probe.resolved !== undefined) {
        knobs[knob] = { value: probe.resolved, provenance: provenanceOf(probe, probe.resolved) };
        continue;
      }
      // Nothing on the wire for this knob. A STORED value here is the F7 case: the capability does not honor
      // it, so it is dropped at the funnel and invisible in both directions until the deck names it.
      if (probe.explicit !== undefined) {
        stale.push({ knob, value: probe.explicit });
      }
      if (probe.floor !== undefined) {
        knobs[knob] = { value: probe.floor, provenance: "floor" };
      }
    }
    return { presetId: params.id, model, knobs, stale, qualityMapping: qualityMappingOf(intent.quality, capability) };
  }
  return { resolveEffective };
}
