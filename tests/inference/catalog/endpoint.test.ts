import { NO_PROVIDER_SECRETS } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import { fetchEndpointModels } from "../../../packages/inference/src/catalog/endpoint.ts";
import { expect, test } from "../../support/fixtures.ts";

test("endpoint catalog fetch normalizes model ids and the supported context-window spellings", async () => {
  const requests: Array<{ readonly input: string; readonly init: RequestInit | undefined }> = [];
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({ input: String(input), init });
    return Promise.resolve(
      Response.json({
        data: [
          { id: "max-model", max_model_len: 131_072, context_length: 1, max_context_length: 2 },
          { id: "context", context_length: 32_768 },
          { id: "max-context", max_context_length: 8192 },
          { id: "unknown", max_model_len: null },
        ],
      }),
    );
  };

  await expect(
    fetchEndpointModels({
      fetch: fetchImpl as typeof fetch,
      baseUrl: "https://models.example/v1/",
      secret: "token",
      headers: { "x-tenant": "owner" },
      secrets: NO_PROVIDER_SECRETS,
    }),
  ).resolves.toEqual([
    { id: "max-model", contextLength: 131_072 },
    { id: "context", contextLength: 32_768 },
    { id: "max-context", contextLength: 8192 },
    { id: "unknown", contextLength: null },
  ]);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.input).toBe("https://models.example/v1/models");
  expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer token");
  expect(new Headers(requests[0]?.init?.headers).get("x-tenant")).toBe("owner");
});

test("endpoint catalog fetch rejects a malformed catalog instead of inventing rows", async () => {
  const fetchImpl = (): Promise<Response> => Promise.resolve(Response.json({ data: [{ id: 42 }] }));

  await expect(
    fetchEndpointModels({
      fetch: fetchImpl as typeof fetch,
      baseUrl: "https://models.example",
      secret: null,
      secrets: NO_PROVIDER_SECRETS,
    }),
  ).rejects.toThrow();
});
