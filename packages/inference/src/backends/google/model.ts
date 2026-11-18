// Native SDK factories use the resolved key explicitly; a missing key must never select a host environment key.
//
// FORBIDDEN: `name:` on `createGoogle` (no call site sets it — ruled in `ai-sdk-surface.md`). The SDK picks
// the options/metadata keys from the factory name:
// `providerOptionsNames = config.provider.includes("vertex") ? ["googleVertex", "vertex"] : ["google"]`
// (`@ai-sdk/google` 4.0.102 `dist/index.js:1509,:3957`; the default `"google.generative-ai"` at :8191), and
// the response parts emit `providerMetadata` ONLY under those names (`wrapProviderMetadata`, :1687,:1893).
// A name containing "vertex" therefore re-keys the bag off `google` and silently zeroes its readers — the
// thought-signature replay keys `providerMetadata.google` in
// `packages/inference/src/backends/v4/stream.ts:147,:186`.

import type { GoogleProvider } from "@ai-sdk/google";
import { createGoogle } from "@ai-sdk/google";
import type { GoogleCall } from "#contract";
import { ProviderError } from "#contract";
import { resolvedScrubSet } from "../http/sanitize.ts";
import { wrapFetch } from "../v4/fetch.ts";

export const GOOGLE_KEY = "google";
const MODEL_PREFIX = "models/";
const TRAILING_SLASH = /\/$/u;

export function googleModelId(model: string): string {
  return model.startsWith(MODEL_PREFIX) ? model.slice(MODEL_PREFIX.length) : model;
}

export function googleBaseUrl(baseUrl: string | null): string {
  if (baseUrl === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google connection carries no base URL" });
  }
  return baseUrl.replace(TRAILING_SLASH, "");
}

export function googleProviderFor(call: GoogleCall): GoogleProvider {
  const { connection, deps } = call;
  if (connection.credential.secret === null || connection.credential.secret.length === 0) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google connection requires an API key" });
  }
  return createGoogle({
    apiKey: connection.credential.secret,
    baseURL: googleBaseUrl(connection.baseUrl),
    ...(connection.transport?.headers === undefined ? {} : { headers: connection.transport.headers }),
    fetch: wrapFetch({
      fetch: deps.fetch,
      secrets: resolvedScrubSet(connection),
      label: call.label,
      responseMap: undefined,
      reasoningKeys: undefined,
      ...(deps.captureWire === undefined
        ? {}
        : {
            capture: {
              sink: deps.captureWire,
              chatId: call.chatId,
              api: call.api,
              wire: connection.wire,
              providerId: connection.providerId,
              model: connection.model,
              reply: deps.captureWireReply === true,
            },
          }),
    }),
  });
}
