// The vendor's per-generation fingerprint, captured through the compatible SDK's own `metadataExtractor` hook.
//
// WHY THE HOOK AND NOT A BODY READ: the SDK parses the response through its own schema, which strips every field
// the schema does not model, so `system_fingerprint` never reaches the fold any other way. The hook receives the
// RAW parsed body — `extractMetadata({ parsedBody })` on the `doGenerate` path and `processChunk(chunk.rawValue)`
// on the stream path (`@ai-sdk/openai-compatible@3.0.75`) — and NO headers and NO key: the SDK spreads the
// returned bag at the TOP LEVEL of `providerMetadata`, beside its own nested writes under `[metadataKey]` and
// `[providerOptionsName]`, so the key is OURS to spell.
//
// THE KEY IS THE PROVIDEROPTIONS KEY (`providerOptionsKey`): the SDK files its own nested writes under the name it
// resolved for the caller's providerOptions bag, and the caller always writes the camel form. The fold reads this
// same derivation, so the bag cannot land under a second spelling the reader never asks for.

import type { MetadataExtractor } from "@ai-sdk/openai-compatible";
import type { SharedV4ProviderMetadata } from "@ai-sdk/provider";

/** The one wire spelling this hook reads. `@ai-sdk/openai`'s chat and responses routes model no such field at all
 *  and the OpenRouter provider builds its bag from its own whitelist, so the compatible chat route is its one home. */
const WIRE_KEY = "system_fingerprint";

/** The bag member's name, which is ours: the SDK only decides where the bag sits, never what it holds. */
const BAG_FIELD = "systemFingerprint";

/** A fingerprint off one raw body. An empty string or a non-string is the field's ABSENCE spelled another way, so
 *  it records nothing rather than a value a reader would compare against a real fingerprint. */
function fingerprintOf(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") {
    return undefined;
  }
  const value: unknown = Reflect.get(body, WIRE_KEY);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function bag(key: string, fingerprint: string | undefined): SharedV4ProviderMetadata | undefined {
  return fingerprint === undefined ? undefined : { [key]: { [BAG_FIELD]: fingerprint } };
}

/** The extractor a chat factory installs: it accumulates the first fingerprint a stream reports (the field rides
 *  every chunk of a healthy stream; a later chunk may carry none) and files the bag under `key`. */
export function systemFingerprintExtractor(key: string): MetadataExtractor {
  let streamed: string | undefined;
  return {
    extractMetadata: ({ parsedBody }) => Promise.resolve(bag(key, fingerprintOf(parsedBody))),
    createStreamExtractor: () => ({
      processChunk: (parsedChunk): void => {
        streamed = streamed ?? fingerprintOf(parsedChunk);
      },
      buildMetadata: () => bag(key, streamed),
    }),
  };
}
