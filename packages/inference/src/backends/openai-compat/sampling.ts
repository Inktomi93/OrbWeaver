// The openai-compat wire's one sampler-spelling seam: the knobs the V4 call options model go to the SDK, every
// other knob rides the body under the row's own spelling (`features.samplerKeys` over `DEFAULT_SAMPLER_KEYS`, and
// any `features.samplerAliases` beside it; `features.samplerOrder`). A row's `samplerEnvelope` moves its knobs into
// that envelope and `antislop` moves the phrase ban to the proxy's own fields. Which knobs ride was decided by the
// funnel; an unset knob is never sent.

import type { Dialect, EndpointFeatures, ResolvedWarning, SamplerKnob, SamplerStage } from "@orb/contracts/inference";
import {
  ANTISLOP_FIELDS,
  BODY_SAMPLER_KNOBS,
  DEFAULT_SAMPLER_KEYS,
  SAMPLER_ENVELOPE_SPELLINGS,
  SAMPLER_KNOBS,
  SAMPLER_ORDER_TOKENS,
} from "@orb/contracts/inference";
import type { ResolvedSampling } from "#contract";

const OPENROUTER_DIALECT: Dialect = "openrouter";
export const LOGIT_BIAS_BAN: NonNullable<EndpointFeatures["bannedStrings"]> = "logit-bias-ban";
export const VLLM_BAD_WORDS: NonNullable<EndpointFeatures["bannedStrings"]> = "vllm-bad-words";
// The openrouter provider spells `top_k` from the V4 option; `@ai-sdk/openai-compatible` drops a V4 `topK`
// with an `unsupported` warning, so on that transport it rides the body instead.
const OPENROUTER_BODY_KNOBS: readonly SamplerKnob[] = BODY_SAMPLER_KNOBS.filter((knob) => knob !== "topK");

interface WireSampling {
  /** The knobs the V4 call options model, handed to `standardSampling`. */
  readonly v4: ResolvedSampling;
  /** The rest, keyed by this server's own body field names. */
  readonly body: Record<string, unknown>;
}

/** What the turn adds to the samplers' spelling: whether it thinks, and the names a slop list must leave alone. */
interface SamplingTurn {
  readonly thinking: boolean;
  readonly speakerNames: readonly string[];
}

interface Spell {
  readonly sampling: ResolvedSampling;
  readonly features: EndpointFeatures;
  /** The knobs that ride the body on this transport. */
  readonly knobs: ReadonlySet<SamplerKnob>;
  readonly warnings: ResolvedWarning[];
  readonly turn: SamplingTurn;
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

/** The knobs the row's envelope carries, spelled inside it ({@link SAMPLER_ENVELOPE_SPELLINGS}), and which knobs those
 *  are, so the top level leaves them out. Every value is a number, a string or a flat list, the only shapes an envelope
 *  holds. */
function spellEnvelope({ sampling, features, knobs, turn }: Spell): { readonly body: Record<string, unknown>; readonly carried: ReadonlySet<SamplerKnob> } {
  if (features.samplerEnvelope === undefined) {
    return { body: {}, carried: new Set<SamplerKnob>() };
  }
  const spelling = SAMPLER_ENVELOPE_SPELLINGS[features.samplerEnvelope];
  const carried = new Set<SamplerKnob>(spelling.knobs.filter((knob) => knobs.has(knob)));
  const envelope: Record<string, unknown> = {};
  for (const knob of carried) {
    const value = sampling[knob];
    if (value !== undefined) {
      envelope[DEFAULT_SAMPLER_KEYS[knob]] = value;
    }
  }
  const bias = sampling.logitBias;
  if (bias !== undefined && knobs.has("logitBias")) {
    // Only id keys reach here (`resolveWordBias` turned each word into its ids), so every key reads as a number.
    const entries = Object.entries(bias);
    envelope[spelling.logitBias.ids] = entries.map(([id]) => Number(id));
    envelope[spelling.logitBias.values] = entries.map(([, value]) => value);
    carried.add("logitBias");
  }
  if (spelling.repetitionWindow && sampling.repetitionPenaltyRange !== undefined && knobs.has("repetitionPenaltyRange")) {
    envelope[DEFAULT_SAMPLER_KEYS.repetitionPenaltyRange] = sampling.repetitionPenaltyRange;
    carried.add("repetitionPenaltyRange");
    if (sampling.repetitionPenalty !== undefined && knobs.has("repetitionPenalty")) {
      envelope[DEFAULT_SAMPLER_KEYS.repetitionPenalty] = sampling.repetitionPenalty;
      carried.add("repetitionPenalty");
    }
  }
  if (turn.thinking) {
    envelope[spelling.closeThinking] = true;
  }
  return { body: Object.keys(envelope).length > 0 ? { [spelling.key]: envelope } : {}, carried };
}

/** An antislop proxy's top-level fields ({@link ANTISLOP_FIELDS}): the whole phrase list, and the slop list with the
 *  room's names in its allow list, so the list never pushes down a name the story uses. */
function spellAntislop({ sampling, features, knobs, turn }: Spell): Record<string, unknown> {
  if (features.antislop !== true) {
    return {};
  }
  const phrases = knobs.has("bannedStrings") ? sampling.bannedStrings : undefined;
  const slop =
    features.slopList === undefined
      ? {}
      : {
          [ANTISLOP_FIELDS.slopList]: features.slopList,
          ...(features.slopStrength === undefined ? {} : { [ANTISLOP_FIELDS.slopStrength]: features.slopStrength }),
          ...(turn.speakerNames.length === 0 ? {} : { [ANTISLOP_FIELDS.slopAllow]: turn.speakerNames }),
        };
  return { ...(phrases === undefined ? {} : { [ANTISLOP_FIELDS.bannedStrings]: phrases }), ...slop };
}

/** The knobs left for the top level, each under the row's key and aliases; the phrase ban rides as `false` bias keys
 *  on a `logit-bias-ban` row. */
function spellTopLevel({ sampling, features, knobs }: Spell, carried: ReadonlySet<SamplerKnob>): Record<string, unknown> {
  const keys = { ...DEFAULT_SAMPLER_KEYS, ...features.samplerKeys };
  const antislop = features.antislop === true;
  const bansAsBias = features.bannedStrings === LOGIT_BIAS_BAN && !antislop;
  // The proxy and the bias spelling take the phrases in their own field, so the row's phrase key stays off the body.
  const phrasesElsewhere = bansAsBias || antislop;
  const spelled: Record<string, unknown> = {};
  for (const knob of knobs) {
    const value = sampling[knob];
    if (value !== undefined && !carried.has(knob) && !(knob === "bannedStrings" && phrasesElsewhere)) {
      for (const key of [keys[knob], ...(features.samplerAliases?.[knob] ?? [])]) {
        spelled[key] = value;
      }
    }
  }
  if (bansAsBias && sampling.bannedStrings !== undefined && knobs.has("bannedStrings")) {
    // `false` is the server's hard ban on every token of the key, so only one-token phrases reach here
    // (`resolveBannedPhrases`); the user's own bias keeps its entries, and a phrase it also biases is banned.
    const existing = spelled[keys.logitBias];
    const bias: Record<string, unknown> = isRecord(existing) ? existing : {};
    spelled[keys.logitBias] = { ...bias, ...Object.fromEntries(sampling.bannedStrings.map((phrase) => [phrase, false])) };
  }
  return spelled;
}

/** The named knobs present on `sampling`, spelled where the row takes them, plus the stage order when it rides. */
function spellSamplers(spell: Spell): Record<string, unknown> {
  const envelope = spellEnvelope(spell);
  const body = { ...spellTopLevel(spell, envelope.carried), ...envelope.body, ...spellAntislop(spell) };
  const order = spell.sampling.samplerOrder;
  return order === undefined ? body : { ...body, ...spellOrder(order, spell.features.samplerOrder, spell.warnings) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Every body key a sampler can ride under on this row: what a translating route (Ollama's `/api/chat`, which
 *  takes them all in `options`) moves out of the OpenAI body. */
export function samplerBodyKeys(features: EndpointFeatures): ReadonlySet<string> {
  const keys = { ...DEFAULT_SAMPLER_KEYS, ...features.samplerKeys };
  const order = features.samplerOrder === undefined ? [] : [SAMPLER_ORDER_TOKENS[features.samplerOrder].key];
  return new Set([...SAMPLER_KNOBS.flatMap((knob) => [keys[knob], ...(features.samplerAliases?.[knob] ?? [])]), ...order]);
}

/** The knobs the V4 call options carry on an OpenAI SDK transport other than OpenRouter's: both
 *  `@ai-sdk/openai-compatible` and the `/responses` model drop a V4 `topK`, so it never rides the options. */
export function v4Sampling(sampling: ResolvedSampling): ResolvedSampling {
  const { topK: _bodySpelled, ...v4 } = sampling;
  return v4;
}

export function wireSampling(
  sampling: ResolvedSampling,
  features: EndpointFeatures,
  context: { readonly dialect: Dialect; readonly warnings: ResolvedWarning[]; readonly turn: SamplingTurn },
): WireSampling {
  const { dialect, warnings, turn } = context;
  if (dialect === OPENROUTER_DIALECT) {
    return { v4: sampling, body: spellSamplers({ sampling, features, knobs: new Set<SamplerKnob>(OPENROUTER_BODY_KNOBS), warnings, turn }) };
  }
  return { v4: v4Sampling(sampling), body: spellSamplers({ sampling, features, knobs: new Set<SamplerKnob>(BODY_SAMPLER_KNOBS), warnings, turn }) };
}
