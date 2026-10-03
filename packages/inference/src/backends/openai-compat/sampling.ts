// The openai-compat wire's one sampler-spelling seam: the knobs the V4 call options model go to the SDK, every
// other knob rides the body under the row's own spelling (`features.samplerKeys` over `DEFAULT_SAMPLER_KEYS`,
// `features.samplerOrder`). Which knobs ride was decided by the funnel; an unset knob is never sent.

import type { Dialect, EndpointFeatures, SamplerKnob, SamplerStage } from "@orb/contracts/inference";
import { BODY_SAMPLER_KNOBS, DEFAULT_SAMPLER_KEYS, SAMPLER_KNOBS, SAMPLER_ORDER_TOKENS } from "@orb/contracts/inference";
import type { ResolvedSampling, ResolvedWarning } from "../../contract/resolve.ts";

const OPENROUTER_DIALECT: Dialect = "openrouter";
// The openrouter provider spells `top_k` from the V4 option; `@ai-sdk/openai-compatible` drops a V4 `topK`
// with an `unsupported` warning, so on that transport it rides the body instead.
const OPENROUTER_BODY_KNOBS: readonly SamplerKnob[] = BODY_SAMPLER_KNOBS.filter((knob) => knob !== "topK");

interface WireSampling {
  /** The knobs the V4 call options model, handed to `standardSampling`. */
  readonly v4: ResolvedSampling;
  /** The rest, keyed by this server's own body field names. */
  readonly body: Record<string, unknown>;
}

/** The order's tokens under its vocabulary's key. A stage the vocabulary cannot spell is a real drop, so it
 *  warns: the capability said the server orders it, the row disagrees. */
function spellOrder(order: readonly SamplerStage[], vocabulary: EndpointFeatures["samplerOrder"], warnings: ResolvedWarning[]): Record<string, unknown> {
  if (vocabulary === undefined) {
    warnings.push({ code: "sampling_knob_dropped", knob: "samplerOrder", message: "samplerOrder ignored: this endpoint's row spells no sampler order" });
    return {};
  }
  const spelling = SAMPLER_ORDER_TOKENS[vocabulary];
  const unspelled = order.filter((stage) => spelling.tokens[stage] === undefined);
  if (unspelled.length > 0) {
    warnings.push({
      code: "sampling_knob_dropped",
      knob: "samplerOrder",
      message: `samplerOrder stages ${unspelled.join(", ")} ignored: this endpoint's row has no token for them`,
    });
  }
  const tokens = order.flatMap((stage) => {
    const token = spelling.tokens[stage];
    return token === undefined ? [] : [token];
  });
  return tokens.length > 0 ? { [spelling.key]: tokens } : {};
}

/** The named knobs present on `sampling`, each under the row's key, plus the stage order when it rides. */
function spellSamplers(
  sampling: ResolvedSampling,
  features: EndpointFeatures,
  knobs: readonly SamplerKnob[],
  warnings: ResolvedWarning[],
): Record<string, unknown> {
  const keys = { ...DEFAULT_SAMPLER_KEYS, ...features.samplerKeys };
  const spelled: Record<string, unknown> = {};
  for (const knob of knobs) {
    const value = sampling[knob];
    if (value !== undefined) {
      spelled[keys[knob]] = value;
    }
  }
  return sampling.samplerOrder === undefined ? spelled : { ...spelled, ...spellOrder(sampling.samplerOrder, features.samplerOrder, warnings) };
}

/** Every body key a sampler can ride under on this row: what a translating route (Ollama's `/api/chat`, which
 *  takes them all in `options`) moves out of the OpenAI body. */
export function samplerBodyKeys(features: EndpointFeatures): ReadonlySet<string> {
  const keys = { ...DEFAULT_SAMPLER_KEYS, ...features.samplerKeys };
  const order = features.samplerOrder === undefined ? [] : [SAMPLER_ORDER_TOKENS[features.samplerOrder].key];
  return new Set([...SAMPLER_KNOBS.map((knob) => keys[knob]), ...order]);
}

export function wireSampling(sampling: ResolvedSampling, features: EndpointFeatures, dialect: Dialect, warnings: ResolvedWarning[]): WireSampling {
  if (dialect === OPENROUTER_DIALECT) {
    return { v4: sampling, body: spellSamplers(sampling, features, OPENROUTER_BODY_KNOBS, warnings) };
  }
  const { topK: _bodySpelled, ...v4 } = sampling;
  return { v4, body: spellSamplers(sampling, features, BODY_SAMPLER_KNOBS, warnings) };
}
