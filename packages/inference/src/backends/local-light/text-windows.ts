// Lossless text windows bound the native attention shape, not merely the tokenizer's accepted context.
import type { LocalTextEncoding } from "@orb/contracts/inference";
import { estimateTokens, safeTokenWindow, splitToTokenBudget } from "@orb/kit/tokens";
import { l2Normalize, mean } from "@orb/kit/vector-math";
import { ProviderError } from "../../contract/errors.ts";

const SPECIAL_TOKEN_RESERVE = 2;

/** Partition text losslessly into checked singleton windows; one window keeps the raw encoder output. */
export async function encodeTextWindows<T>(
  text: string,
  encoding: LocalTextEncoding,
  tokenize: (text: string) => Promise<{ readonly inputs: T; readonly batch: number; readonly length: number }>,
  forward: (inputs: T) => Promise<Float32Array>,
): Promise<Float32Array> {
  const budget = safeTokenWindow(encoding.maxTokens) - SPECIAL_TOKEN_RESERVE;
  const pending = [text];
  const vectors: Float32Array[] = [];
  while (pending.length > 0) {
    const piece = pending.shift();
    if (piece === undefined) {
      break;
    }
    const tokenized = await tokenize(piece);
    if (tokenized.batch !== 1 || !Number.isSafeInteger(tokenized.length) || tokenized.length <= 0) {
      throw new ProviderError({ kind: "server", retryable: false, message: "local-light: invalid singleton text token shape" });
    }
    if (tokenized.length > encoding.maxTokens) {
      const refined = splitToTokenBudget(piece, Math.min(budget, Math.floor(estimateTokens(piece) / 2)));
      if (refined.length < 2) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: "local-light: text cannot be split into the native token window" });
      }
      pending.unshift(...refined);
      continue;
    }
    vectors.push(await forward(tokenized.inputs));
  }
  const first = vectors[0];
  if (first === undefined) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "local-light: an empty text has no embedding" });
  }
  return vectors.length === 1 ? first : l2Normalize(mean(vectors.map(l2Normalize)));
}
