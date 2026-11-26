// What a word tokenizes to on one server (`features.tokenizeApi`), cached per (server URL, model, word) in memory and
// beside the endpoint facts, so neither a turn nor a restart asks twice. Ordinary tokenize failures drop the
// bias entry or banned phrase with a warning and are never cached; cancellation aborts the turn.

import type { ResolvedWarning, TokenizeApi, WordTokens } from "@orb/contracts/inference";
import { TOKEN_ID_KEY } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import { endpointTokensKey, endpointTokensPrefix } from "#catalog";
import type { Resolved, ResolvedSampling } from "#contract";
import { ProviderError } from "#contract";
import type { TokenLexicon, TokenTarget } from "#src/contract/openai-backend.ts";
import type { SnapshotStore } from "#src/deps.ts";
import { authHeaders, fetchJson, serverRootOf } from "../http/fetch-json.ts";
import { resolvedScrubSet } from "../http/sanitize.ts";
import { LOGIT_BIAS_BAN, VLLM_BAD_WORDS } from "./sampling.ts";

/** One server's tokenize endpoint: where it lives under the server root, the body for one word, and the ids and
 *  pieces out of its answer. `wordKeysNative` = the server's own `logit_bias` takes word keys as they are. */
interface TokenizeSpec {
  readonly path: string;
  readonly body: (word: string, model: string) => Record<string, unknown>;
  readonly read: (json: unknown) => { readonly ids: number[]; readonly pieces?: string[] | undefined };
  readonly wordKeysNative: boolean;
}

const TOKEN_ID = z.number().int().nonnegative();
const HEX = 16;
const BYTE_DIGITS = 2;
// llama.cpp sends a piece that is not valid UTF-8 as its byte values.
const llamaPieceSchema = z.union([z.string(), z.array(z.number().int())]);
const llamaTokensSchema = z.object({ tokens: z.array(z.object({ id: TOKEN_ID, piece: llamaPieceSchema }).strip()) }).strip();
const vllmTokensSchema = z.object({ tokens: z.array(TOKEN_ID), token_strs: z.array(z.string()).nullish() }).strip();
const koboldTokensSchema = z.object({ ids: z.array(TOKEN_ID) }).strip();

function pieceText(piece: z.infer<typeof llamaPieceSchema>): string {
  return typeof piece === "string" ? piece : piece.map((byte) => `<0x${byte.toString(HEX).padStart(BYTE_DIGITS, "0").toUpperCase()}>`).join("");
}

const TOKENIZE_SPECS: Readonly<Record<TokenizeApi, TokenizeSpec>> = {
  // tools/server/server-context.cpp post_tokenize; `model` routes the call in router mode.
  "llama-cpp": {
    path: "/tokenize",
    body: (word, model) => ({ content: word, add_special: false, parse_special: false, with_pieces: true, model }),
    read: (json) => {
      const tokens = llamaTokensSchema.parse(json).tokens;
      return { ids: tokens.map((token) => token.id), pieces: tokens.map((token) => pieceText(token.piece)) };
    },
    wordKeysNative: true,
  },
  // vllm/entrypoints/serve/tokenize/protocol.py TokenizeCompletionRequest / TokenizeResponse.
  vllm: {
    path: "/tokenize",
    body: (word, model) => ({ model, prompt: word, add_special_tokens: false, return_token_strs: true }),
    read: (json) => {
      const parsed = vllmTokensSchema.parse(json);
      return { ids: parsed.tokens, ...(parsed.token_strs === null || parsed.token_strs === undefined ? {} : { pieces: parsed.token_strs }) };
    },
    wordKeysNative: false,
  },
  // koboldcpp.py `/api/extra/tokenize`: `special: false` adds no BOS.
  koboldcpp: {
    path: "/api/extra/tokenize",
    body: (word) => ({ prompt: word, special: false }),
    read: (json) => ({ ids: koboldTokensSchema.parse(json).ids }),
    wordKeysNative: false,
  },
};

const heldTokensSchema = z.object({ ids: z.array(TOKEN_ID), pieces: z.array(z.string()).optional() }).strip();
// Persisted as entries and held as a Map: a word is user text, so `constructor` or `__proto__` must never
// read as an object's inherited member.
const persistedSchema = z.array(z.tuple([z.string(), heldTokensSchema]));
type Cached = ReadonlyMap<string, z.infer<typeof heldTokensSchema>>;

/** A connection's tokenize target, or `null` when its row names no tokenize endpoint or it has no URL. */
export function tokenTargetOf(connection: Resolved): TokenTarget | null {
  const api = connection.features.tokenizeApi;
  if (api === undefined || connection.baseUrl === null) {
    return null;
  }
  return {
    baseUrl: connection.baseUrl,
    model: connection.model,
    api,
    secret: connection.credential.secret,
    headers: connection.transport?.headers,
    secrets: resolvedScrubSet(connection),
  };
}

function tokenizeAbort(cause: unknown): ProviderError {
  return new ProviderError({ kind: "aborted", retryable: false, message: "tokenize: request aborted", cause });
}

async function requestTokens(fetchImpl: typeof fetch, target: TokenTarget, text: string, signal: AbortSignal): Promise<ReturnType<TokenizeSpec["read"]>> {
  const spec = TOKENIZE_SPECS[target.api];
  const result = await fetchJson({
    fetch: fetchImpl,
    url: `${serverRootOf(target.baseUrl)}${spec.path}`,
    method: "POST",
    headers: authHeaders(target.secret, target.headers),
    body: spec.body(text, target.model),
    secrets: target.secrets,
    label: "tokenize",
    signal,
  });
  return spec.read(result.json);
}

/** Chat text is private turn data; the persistent logit-bias lexicon must never retain it. */
export function passageCounterFor(fetchImpl: typeof fetch, connection: Resolved): ((text: string, signal: AbortSignal) => Promise<number>) | null {
  const target = tokenTargetOf(connection);
  return target === null ? null : async (text, signal): Promise<number> => (await requestTokens(fetchImpl, target, text, signal)).ids.length;
}

export function createTokenLexicon(deps: { readonly fetch: typeof fetch; readonly snapshotStore: SnapshotStore }): TokenLexicon {
  const held = new Map<string, Cached>();

  const load = async (key: string): Promise<Cached> => {
    const hit = held.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const raw = await deps.snapshotStore.read(key);
    const parsed = raw === null ? null : persistedSchema.safeParse(JSON.parse(raw));
    const cached: Cached = new Map(parsed?.success === true ? parsed.data : []);
    held.set(key, cached);
    return cached;
  };

  const ask = async (target: TokenTarget, word: string, signal: AbortSignal): Promise<WordTokens> => {
    try {
      const read = await requestTokens(deps.fetch, target, word, signal);
      return { ok: true, word, ids: read.ids, ...(read.pieces !== undefined ? { pieces: read.pieces } : {}) };
    } catch (err) {
      if (signal.aborted) {
        throw tokenizeAbort(err);
      }
      return { ok: false, word, reason: errorMessage(err) };
    }
  };

  return {
    lookup: async (target, words, signal): Promise<readonly WordTokens[]> => {
      const key = endpointTokensKey(target.baseUrl, target.model);
      const cached = await load(key);
      const missing = [...new Set(words)].filter((word) => !cached.has(word));
      const asked = await Promise.all(missing.map((word) => ask(target, word, signal)));
      const learned = asked.filter((answer) => answer.ok);
      if (learned.length > 0) {
        // Onto what is held now, so a lookup that finished meanwhile keeps its words.
        const next = new Map(held.get(key) ?? cached);
        for (const answer of learned) {
          next.set(answer.word, { ids: answer.ids, ...(answer.pieces !== undefined ? { pieces: answer.pieces } : {}) });
        }
        held.set(key, next);
        await deps.snapshotStore.write(key, JSON.stringify([...next]));
      }
      const failed = new Map(asked.filter((answer) => !answer.ok).map((answer) => [answer.word, answer]));
      const now = held.get(key) ?? cached;
      return words.map((word): WordTokens => {
        const entry = now.get(word);
        if (entry !== undefined) {
          return { ok: true, word, ids: entry.ids, ...(entry.pieces !== undefined ? { pieces: entry.pieces } : {}) };
        }
        return failed.get(word) ?? { ok: false, word, reason: "not tokenized" };
      });
    },
    forget: async (baseUrl): Promise<void> => {
      const prefix = baseUrl === undefined ? null : endpointTokensPrefix(baseUrl);
      for (const key of held.keys()) {
        if (prefix === null || key.startsWith(prefix)) {
          held.delete(key);
        }
      }
      if (prefix !== null) {
        await deps.snapshotStore.deletePrefix(prefix);
      }
    },
  };
}

/** A logit bias with its word keys made sendable on this connection: kept where the server's own `logit_bias`
 *  takes words, turned into each word's token ids where the server only takes ids, and dropped with a warning
 *  where the row names no tokenize endpoint or the word could not be tokenized. Id keys pass through. */
export async function resolveWordBias(args: {
  readonly sampling: ResolvedSampling;
  readonly connection: Resolved;
  readonly lexicon: TokenLexicon;
  readonly warnings: ResolvedWarning[];
  readonly signal: AbortSignal;
}): Promise<ResolvedSampling> {
  const { sampling, connection, lexicon, warnings, signal } = args;
  const bias = sampling.logitBias;
  const words = bias === undefined ? [] : Object.keys(bias).filter((key) => !TOKEN_ID_KEY.test(key));
  if (bias === undefined || words.length === 0) {
    return sampling;
  }
  const target = tokenTargetOf(connection);
  if (target !== null && TOKENIZE_SPECS[target.api].wordKeysNative) {
    return sampling;
  }
  const ids: Record<string, number> = Object.fromEntries(Object.entries(bias).filter(([key]) => TOKEN_ID_KEY.test(key)));
  const answers =
    target === null
      ? words.map((word): WordTokens => ({ ok: false, word, reason: "this endpoint's row names no tokenize endpoint" }))
      : await lexicon.lookup(target, words, signal);
  for (const answer of answers) {
    const value = bias[answer.word];
    if (!answer.ok || value === undefined) {
      warnings.push({
        code: "sampling_knob_dropped",
        knob: "logitBias",
        message: `logitBias entry "${answer.word}" ignored: ${answer.ok ? "no value" : answer.reason}`,
      });
      continue;
    }
    for (const id of answer.ids) {
      ids[String(id)] = value;
    }
  }
  return { ...sampling, logitBias: ids };
}

const NO_TOKENIZE_ENDPOINT = "this endpoint's row names no tokenize endpoint";
const ONE_TOKEN_ONLY = "this server bans each token of a phrase in every context, so only a one-token phrase is sent";
const SPACED_FORM_SKIPPED =
  "this server bans a phrase mid-sentence only when its space-led form has as many tokens as the bare phrase, so it would be banned only at the start of a line";

/** Why each phrase cannot ride, keyed by phrase; a phrase absent from the map rides. */
type PhraseVerdicts = ReadonlyMap<string, string>;

async function tokenizedAll(
  lexicon: TokenLexicon,
  target: TokenTarget | null,
  words: readonly string[],
  signal: AbortSignal,
): Promise<ReadonlyMap<string, WordTokens>> {
  const answers =
    target === null ? words.map((word): WordTokens => ({ ok: false, word, reason: NO_TOKENIZE_ENDPOINT })) : await lexicon.lookup(target, words, signal);
  return new Map(answers.map((answer) => [answer.word, answer]));
}

/** llama.cpp's string `logit_bias` key: only a one-token phrase keeps its meaning. */
async function oneTokenVerdicts(lexicon: TokenLexicon, target: TokenTarget | null, phrases: readonly string[], signal: AbortSignal): Promise<PhraseVerdicts> {
  const answers = await tokenizedAll(lexicon, target, phrases, signal);
  return new Map(
    phrases.flatMap((phrase) => {
      const answer = answers.get(phrase);
      if (answer === undefined || !answer.ok) {
        return [[phrase, answer?.reason ?? NO_TOKENIZE_ENDPOINT]];
      }
      return answer.ids.length === 1 ? [] : [[phrase, ONE_TOKEN_ONLY]];
    }),
  );
}

/** vLLM's `bad_words`: it tokenizes the phrase with its leading space stripped, then adds the space-led form only when
 *  that form is non-empty, starts on another token and has as many tokens (`SamplingParams.update_from_tokenizer`).
 *  Without the space-led form a phrase is never banned mid-sentence, which is where it is met. */
async function spacedFormVerdicts(lexicon: TokenLexicon, target: TokenTarget | null, phrases: readonly string[], signal: AbortSignal): Promise<PhraseVerdicts> {
  const forms = phrases.map((phrase) => ({ phrase, bare: phrase.trimStart(), spaced: ` ${phrase.trimStart()}` }));
  const answers = await tokenizedAll(
    lexicon,
    target,
    forms.flatMap((form) => [form.bare, form.spaced]),
    signal,
  );
  return new Map(
    forms.flatMap(({ phrase, bare, spaced }) => {
      const bareTokens = answers.get(bare);
      const spacedTokens = answers.get(spaced);
      if (bareTokens === undefined || !bareTokens.ok || spacedTokens === undefined || !spacedTokens.ok) {
        const reason = [bareTokens, spacedTokens].flatMap((answer) => (answer !== undefined && !answer.ok ? [answer.reason] : []))[0];
        return [[phrase, reason ?? NO_TOKENIZE_ENDPOINT]];
      }
      const kept = spacedTokens.ids.length > 0 && spacedTokens.ids[0] !== bareTokens.ids[0] && spacedTokens.ids.length === bareTokens.ids.length;
      return kept ? [] : [[phrase, SPACED_FORM_SKIPPED]];
    }),
  );
}

/** The banned phrases a row's spelling honours as a phrase. A `logit-bias-ban` row keeps one-token phrases and a
 *  `vllm-bad-words` row the phrases vLLM also bans mid-sentence; every other phrase drops with one warning per reason,
 *  naming the phrases and, when some still rode, counting both sides. A `list` row and an antislop proxy send them whole. */
export async function resolveBannedPhrases(args: {
  readonly sampling: ResolvedSampling;
  readonly connection: Resolved;
  readonly lexicon: TokenLexicon;
  readonly warnings: ResolvedWarning[];
  readonly signal: AbortSignal;
}): Promise<ResolvedSampling> {
  const { sampling, connection, lexicon, warnings, signal } = args;
  const phrases = sampling.bannedStrings;
  const spelling = connection.features.bannedStrings;
  if (phrases === undefined || phrases.length === 0 || connection.features.antislop === true || (spelling !== LOGIT_BIAS_BAN && spelling !== VLLM_BAD_WORDS)) {
    return sampling;
  }
  const target = tokenTargetOf(connection);
  const verdicts =
    spelling === LOGIT_BIAS_BAN ? await oneTokenVerdicts(lexicon, target, phrases, signal) : await spacedFormVerdicts(lexicon, target, phrases, signal);
  const kept = phrases.filter((phrase) => !verdicts.has(phrase));
  if (verdicts.size > 0) {
    // One warning for the knob, so a turn reads as one partial or whole drop however many reasons it had.
    const reasons = [...Map.groupBy(verdicts, ([, reason]) => reason)].map(
      ([reason, dropped]) => `${dropped.map(([phrase]) => `"${phrase}"`).join(", ")}: ${reason}`,
    );
    warnings.push({
      code: "sampling_knob_dropped",
      knob: "bannedStrings",
      message: `bannedStrings phrases ignored, ${reasons.join("; ")}`,
      ...(kept.length > 0 ? { partial: { dropped: verdicts.size, sent: kept.length } } : {}),
    });
  }
  const { bannedStrings: _all, ...rest } = sampling;
  return kept.length > 0 ? { ...rest, bannedStrings: kept } : rest;
}

export type { TokenLexicon, TokenTarget } from "#src/contract/openai-backend.ts";
