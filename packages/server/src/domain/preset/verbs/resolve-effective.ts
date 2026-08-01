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

import type { ModelCapability } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_MAX_OUTPUT_TOKENS, parsePromptConfig, QUALITY_EFFORT, QUALITY_SAMPLING } from "@orb/contracts/preset";
import type { ResolvedChatKnobs } from "#infra/providers";
import { resolveChat } from "#infra/providers";
import type { PresetContext } from "../context";
import { PresetNotFoundError } from "../contract/errors";
import type { ResolveEffectiveParams } from "../contract/params";
import type { PresetService } from "../contract/service";
import type { EffectiveKnob, EffectiveKnobReading, EffectivePreset, EffectiveProvenance, StaleKnob } from "../contract/views";
import { EFFECTIVE_KNOBS } from "../contract/views";
import { readablePreset } from "../persistence/queries";

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
 *  `budget` mode there is no effort at all — the model takes a token budget instead of a level. */
function resolvedEffortOf(reasoning: ResolvedChatKnobs["reasoning"]): string | undefined {
  if (!reasoning.enabled) {
    return EFFORT_OFF;
  }
  return reasoning.mode === "budget" ? undefined : reasoning.effort;
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
function probeKnobs(params: UserIntent, capability: ModelCapability): Record<EffectiveKnob, KnobProbe> {
  const resolved = resolveChat(params, capability);
  const { sampling, reasoning } = resolved;
  const quality = params.quality;
  // Safe to index: `params` reached here through `parsePromptConfig`, whose `.catch({})` drops the WHOLE
  // params blob when any field (quality included) fails its enum — so a stored garbage dial can never index.
  const qualityTemperature = quality !== undefined ? QUALITY_SAMPLING[quality].temperature : undefined;
  const qualityEffort = quality !== undefined ? QUALITY_EFFORT[quality] : undefined;
  const effortResolved = resolvedEffortOf(reasoning);
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
    const { model, capability } = await ctx.resolveChatCapability({ principal: params.principal });
    const probes = probeKnobs(parsePromptConfig(row.config).params, capability);

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
    return { presetId: params.id, model, knobs, stale };
  }
  return { resolveEffective };
}
