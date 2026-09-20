// The `anthropic-messages` model factory — one `LanguageModelV4` per CALL over `@ai-sdk/anthropic`
// (`createAnthropic({ apiKey, baseURL, fetch })`, §8.5). Per call so the wrapped fetch closes over this
// call's capture context. The row's `baseUrl` is the API ORIGIN; the SDK wants the `/v1` prefix.

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { ChatId } from "@orb/kit/ids";
import type { WireCaptureSink } from "../../contract/backend.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { Resolved } from "../../contract/resolved.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { wrapFetch } from "../v4/fetch.ts";

const V1_PATH = "/v1";
const TRAILING_SLASH_RE = /\/$/u;

/** The `providerOptions` key the anthropic converter reads. */
export const ANTHROPIC_KEY = "anthropic";

export interface AnthropicTransportDeps {
  readonly fetch: typeof fetch;
  readonly captureWire?: WireCaptureSink | undefined;
  /** Tap the reply bytes onto the capture entry too (§D2) — the process-tier opt-in, off by default. */
  readonly captureWireReply?: boolean | undefined;
}

export interface AnthropicCall {
  readonly connection: Resolved;
  readonly deps: AnthropicTransportDeps;
  readonly label: string;
  readonly api: string;
  readonly chatId?: ChatId | undefined;
}

export function anthropicBaseUrl(connection: Resolved, label: string): string {
  if (connection.baseUrl === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the connection carries no base URL` });
  }
  const origin = connection.baseUrl.replace(TRAILING_SLASH_RE, "");
  return origin.endsWith(V1_PATH) ? origin : `${origin}${V1_PATH}`;
}

export function anthropicModelFor(call: AnthropicCall): LanguageModelV4 {
  const { connection, deps } = call;
  const provider = createAnthropic({
    baseURL: anthropicBaseUrl(connection, call.label),
    ...(connection.credential.secret !== null ? { apiKey: connection.credential.secret } : {}),
    fetch: wrapFetch({
      fetch: deps.fetch,
      secrets: resolvedScrubSet(connection),
      label: call.label,
      responseMap: undefined,
      reasoningKeys: undefined,
      ...(deps.captureWire !== undefined
        ? {
            capture: {
              sink: deps.captureWire,
              chatId: call.chatId,
              api: call.api,
              wire: connection.wire,
              providerId: connection.providerId,
              model: connection.model,
              reply: deps.captureWireReply === true,
            },
          }
        : {}),
    }),
  });
  return provider.chat(connection.model);
}
