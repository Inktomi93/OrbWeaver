// Tokens that name one purpose. A literal that equals one in value only is not owned by it: the census offers general tokens as owners and reports a scoped one as a candidate.
import type { ValueToken, ValueTokens } from "./tokens.ts";

const GENERAL = new WeakMap<ValueTokens, ValueTokens>();

/** The tokens with the purpose-scoped ones removed, indexed like the input. */
export function generalTokens(tokens: ValueTokens): ValueTokens {
  const cached = GENERAL.get(tokens);
  if (cached !== undefined) {
    return cached;
  }
  const all = tokens.all.filter((token) => token.scope === null);
  const byValue = new Map<string, ValueToken[]>();
  for (const [key, held] of tokens.byValue) {
    const kept = held.filter((token) => token.scope === null);
    if (kept.length > 0) {
      byValue.set(key, kept);
    }
  }
  const general = { all, byValue, staleScopes: tokens.staleScopes };
  GENERAL.set(tokens, general);
  return general;
}
