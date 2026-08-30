// domain/credentials/substrate/parse-metadata — pins the header's whole claim: a corrupt row collapses to
// null rather than letting an undefined baseUrl escape into an outbound fetch, and the fields default-fill
// (undefined-optional → null/undefined per the resolver's own contract).

import { describe } from "vitest";
import { parseCustomOpenAiEndpoint } from "../../../../../packages/server/src/domain/credentials/substrate/parse-metadata.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("parseCustomOpenAiEndpoint", () => {
  test("a well-formed metadata blob resolves every field", () => {
    const endpoint = parseCustomOpenAiEndpoint({
      kind: "custom_openai",
      baseUrl: "http://localhost:8080",
      model: "local-model",
      headers: { "x-key": "1" },
      contextWindow: 4096,
      includeBody: { provider: "test" },
      excludeBody: ["frequency_penalty"],
    });
    expect(endpoint).toEqual({
      baseUrl: "http://localhost:8080",
      model: "local-model",
      headers: { "x-key": "1" },
      contextWindow: 4096,
      includeBody: { provider: "test" },
      excludeBody: ["frequency_penalty"],
      responseMap: null,
    });
  });

  test("null metadata (no row) resolves to null — never an undefined baseUrl escaping outbound", () => {
    expect(parseCustomOpenAiEndpoint(null)).toBeNull();
  });

  test("a corrupt blob (missing required baseUrl) collapses to null, never throws", () => {
    expect(() => parseCustomOpenAiEndpoint({ kind: "custom_openai" })).not.toThrow();
    expect(parseCustomOpenAiEndpoint({ kind: "custom_openai" })).toBeNull();
  });

  test("a wrong-kind blob (e.g. left over from a different source) resolves to null", () => {
    expect(parseCustomOpenAiEndpoint({ kind: "openrouter", baseUrl: "http://x" })).toBeNull();
  });

  test("absent optional fields default to null (model/headers/includeBody/excludeBody), contextWindow stays undefined", () => {
    const endpoint = parseCustomOpenAiEndpoint({ kind: "custom_openai", baseUrl: "http://localhost:8080" });
    expect(endpoint).toEqual({
      baseUrl: "http://localhost:8080",
      model: null,
      headers: null,
      contextWindow: undefined,
      includeBody: null,
      excludeBody: null,
      responseMap: null,
    });
  });
});
