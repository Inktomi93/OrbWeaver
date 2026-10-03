// What a word tokenizes to on one server (`features.tokenizeApi`), cached per (server URL, model, word) in memory and
// beside the endpoint facts, so neither a turn nor a restart asks twice. A failed word is reported, never cached,
// and never fails the caller: the turn drops that bias entry with a warning.

import type { TokenizeApi, WordTokens } from "@orb/contracts/inference";
import { TOKEN_ID_KEY } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import { endpointTokensKey, endpointTokensPrefix } from "../../catalog/keys.ts";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import type { ResolvedSampling, ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { SnapshotStore } from "../../deps.ts";
import { authHeaders, fetchJson, serverRootOf } from "../kit/fetch-json.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";

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
const llamaTokensSchema = z.object({ tokens: z.array(z.object({ id: TOKEN_ID, piece: llamaPieceSchema })) });
const vllmTokensSchema = z.object({ tokens: z.array(TOKEN_ID), token_strs: z.array(z.string()).nullish() });
const koboldTokensSchema = z.object({ ids: z.array(TOKEN_ID) });

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

const cachedSchema = z.record(z.string(), z.object({ ids: z.array(TOKEN_ID), pieces: z.array(z.string()).optional() }));
type Cached = z.infer<typeof cachedSchema>;

/** Where one connection's words are tokenized. */
export interface TokenTarget {
  readonly baseUrl: string;
  readonly model: string;
  readonly api: TokenizeApi;
  readonly secret: string | null;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly secrets: ProviderScrubSet;
}

export interface TokenLexicon {
  /** Each word's tokens, from the cache where held; every missing word is asked once, in parallel, and cached. */
  readonly lookup: (target: TokenTarget, words: readonly string[]) => Promise<readonly WordTokens[]>;
  /** Forget one server's lookups (or every server's), in memory and in the store. */
  readonly forget: (baseUrl: string | undefined) => Promise<void>;
}

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

export function createTokenLexicon(deps: { readonly fetch: typeof fetch; readonly snapshotStore: SnapshotStore }): TokenLexicon {
  const held = new Map<string, Cached>();

  const load = async (key: string): Promise<Cached> => {
    const hit = held.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const raw = await deps.snapshotStore.read(key);
    const parsed = raw === null ? null : cachedSchema.safeParse(JSON.parse(raw));
    const cached: Cached = parsed?.success === true ? parsed.data : {};
    held.set(key, cached);
    return cached;
  };

  const ask = async (target: TokenTarget, word: string): Promise<WordTokens> => {
    const spec = TOKENIZE_SPECS[target.api];
    try {
      const result = await fetchJson({
        fetch: deps.fetch,
        url: `${serverRootOf(target.baseUrl)}${spec.path}`,
        method: "POST",
        headers: authHeaders(target.secret, target.headers),
        body: spec.body(word, target.model),
        secrets: target.secrets,
        label: "tokenize",
      });
      const read = spec.read(result.json);
      return { ok: true, word, ids: read.ids, ...(read.pieces !== undefined ? { pieces: read.pieces } : {}) };
    } catch (err) {
      return { ok: false, word, reason: errorMessage(err) };
    }
  };

  return {
    lookup: async (target, words): Promise<readonly WordTokens[]> => {
      const key = endpointTokensKey(target.baseUrl, target.model);
      const cached = await load(key);
      const missing = [...new Set(words)].filter((word) => cached[word] === undefined);
      const asked = await Promise.all(missing.map((word) => ask(target, word)));
      const learned = asked.filter((answer) => answer.ok);
      if (learned.length > 0) {
        // Onto what is held now, so a lookup that finished meanwhile keeps its words.
        const next: Cached = { ...(held.get(key) ?? cached) };
        for (const answer of learned) {
          next[answer.word] = { ids: answer.ids, ...(answer.pieces !== undefined ? { pieces: answer.pieces } : {}) };
        }
        held.set(key, next);
        await deps.snapshotStore.write(key, JSON.stringify(next));
      }
      const failed = new Map(asked.filter((answer) => !answer.ok).map((answer) => [answer.word, answer]));
      const now = held.get(key) ?? cached;
      return words.map((word): WordTokens => {
        const entry = now[word];
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
export async function resolveWordBias(
  sampling: ResolvedSampling,
  connection: Resolved,
  lexicon: TokenLexicon,
  warnings: ResolvedWarning[],
): Promise<ResolvedSampling> {
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
      : await lexicon.lookup(target, words);
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
