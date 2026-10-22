// The `anthropic-messages` model factory — one `LanguageModelV4` per CALL over `@ai-sdk/anthropic`
// (`createAnthropic({ apiKey, baseURL, fetch })`, §8.5). Per call so the wrapped fetch closes over this
// call's capture context. The row's `baseUrl` is the API ORIGIN; the SDK wants the `/v1` prefix.

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { Resolved } from "#contract";
import { ProviderError } from "#contract";
import type { AnthropicCall } from "../../contract/anthropic-backend.ts";
import { resolvedScrubSet } from "../http/sanitize.ts";
import { wrapFetch } from "../v4/fetch.ts";

const V1_PATH = "/v1";
const TRAILING_SLASH_RE = /\/$/u;

/** The `providerOptions` key the anthropic converter reads. */
export const ANTHROPIC_KEY = "anthropic";

const OUTPUT_CONFIG_KEY = "output_config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The request body with the planned schema in `output_config.format`, where the SDK wrote one. */
function withPlannedSchema(body: Record<string, unknown>, schema: Record<string, unknown>): Record<string, unknown> {
  const config = body[OUTPUT_CONFIG_KEY];
  const format = isRecord(config) ? config["format"] : undefined;
  if (!(isRecord(config) && isRecord(format))) {
    return body;
  }
  return { ...body, [OUTPUT_CONFIG_KEY]: { ...config, format: { ...format, schema } } };
}

export function anthropicBaseUrl(connection: Pick<Resolved, "baseUrl">, label: string): string {
  if (connection.baseUrl === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the connection carries no base URL` });
  }
  const origin = connection.baseUrl.replace(TRAILING_SLASH_RE, "");
  return origin.endsWith(V1_PATH) ? origin : `${origin}${V1_PATH}`;
}

export function anthropicModelFor(call: AnthropicCall): LanguageModelV4 {
  const { connection, deps } = call;
  const planned = call.plannedSchema;
  const provider = createAnthropic({
    baseURL: anthropicBaseUrl(connection, call.label),
    ...(connection.credential.secret !== null ? { apiKey: connection.credential.secret } : {}),
    fetch: wrapFetch({
      fetch: deps.fetch,
      secrets: resolvedScrubSet(connection),
      label: call.label,
      responseMap: undefined,
      reasoningKeys: undefined,
      ...(planned !== undefined ? { shapeBody: (body: Record<string, unknown>): Record<string, unknown> => withPlannedSchema(body, planned) } : {}),
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

export type { AnthropicCall } from "../../contract/anthropic-backend.ts";
