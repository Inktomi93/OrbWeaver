// What a connection's server tokenizes a word or phrase into: the ids a word-keyed logit bias rides as, and the
// pieces the logit-bias editor shows beside the word. A word the server could not tokenize carries why.

import { z } from "zod";

/** The most words one editor read may ask about; the editor sends one bias list at a time. */
export const TOKENIZE_WORDS_MAX = 64;

/** The longest word or phrase one lookup takes; a bias phrase is a few tokens, never a passage. */
export const TOKENIZE_WORD_CHARS_MAX = 64;

export const wordTokensSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), word: z.string(), ids: z.array(z.number().int().nonnegative()), pieces: z.array(z.string()).optional() }),
  z.object({ ok: z.literal(false), word: z.string(), reason: z.string() }),
]);
export type WordTokens = z.infer<typeof wordTokensSchema>;

/** One editor read: whether the connection's server has a tokenize endpoint at all (the editor offers word
 *  entries only where it does), and each asked word's tokens. An empty word list asks only the first. */
export const tokenizeResultSchema = z.object({ available: z.boolean(), words: z.array(wordTokensSchema) });
export type TokenizeResult = z.infer<typeof tokenizeResultSchema>;

/** A logit-bias key that names a token id rather than a word. */
export const TOKEN_ID_KEY = /^\d+$/u;
