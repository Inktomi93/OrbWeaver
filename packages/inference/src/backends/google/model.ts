// Native SDK factories use the resolved key explicitly; a missing key must never select a host environment key.

import type { GoogleProvider } from "@ai-sdk/google";
import { createGoogle } from "@ai-sdk/google";
import { ProviderError } from "../../contract/errors.ts";
import type { GoogleCall } from "../../contract/google.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
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
