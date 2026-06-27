// createRerankRole — the `rerank` role dispatcher. Switches on `credential.source`. The hosted
// (openrouter) arm is permitted at the firewall (the openrouter rerank BACKEND itself throws a typed
// not-supported error — that's the backend's concern, not the dispatcher's); local vLLM / local-light
// are the real path. The firewall rejects max-pro-sub/custom_openai. This mirror asserts the routed
// backend per permitted source + every fail-closed path of THIS dispatcher.

import type {
  ProviderBackend,
  RerankRequest,
  RerankResult,
  ResolvedCredential,
} from "@orb/server/infra/providers";
import { createRerankRole, ProviderError } from "@orb/server/infra/providers";
import { describe, expect, test } from "vitest";

function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

const RERANK_RESULT = {} as unknown as RerankResult;

/** A backend whose `rerank` records `${key}:rerank` so the routed selection is observable. */
function spy(key: ProviderBackend["key"], calls: string[]): ProviderBackend {
  return {
    key,
    rerank: (): Promise<RerankResult> => {
      calls.push(`${key}:rerank`);
      return Promise.resolve(RERANK_RESULT);
    },
  };
}

function allBackends(calls: string[]): Map<ProviderBackend["key"], ProviderBackend> {
  return new Map([
    ["openrouter", spy("openrouter", calls)],
    ["vllm", spy("vllm", calls)],
    ["local-light", spy("local-light", calls)],
    ["agent-sdk", spy("agent-sdk", calls)],
    ["custom-openai", spy("custom-openai", calls)],
  ]);
}

function rerankReq(source: ResolvedCredential["source"]): RerankRequest {
  return {
    credential: cred(source),
    model: "m",
    query: "q",
    documents: [],
  } as unknown as RerankRequest;
}

describe("createRerankRole — source → the sealed rerank backend", () => {
  test("openrouter, vllm, and local-light each route to their own backend's rerank impl", async () => {
    const or: string[] = [];
    const vl: string[] = [];
    const ll: string[] = [];
    await Promise.all([
      createRerankRole({ backends: allBackends(or) })(rerankReq("openrouter")),
      createRerankRole({ backends: allBackends(vl) })(rerankReq("vllm")),
      createRerankRole({ backends: allBackends(ll) })(rerankReq("local-light")),
    ]);
    expect(or).toEqual(["openrouter:rerank"]);
    expect(vl).toEqual(["vllm:rerank"]);
    expect(ll).toEqual(["local-light:rerank"]);
  });
});

describe("createRerankRole — fail-closed (firewall + sealed dispatch)", () => {
  test("max-pro-sub is denied for rerank (wrong-source-for-role)", async () => {
    const calls: string[] = [];
    const role = createRerankRole({ backends: allBackends(calls) });
    await expect(role(rerankReq("max-pro-sub"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("custom_openai is denied for rerank (wrong-source-for-role)", async () => {
    const calls: string[] = [];
    const role = createRerankRole({ backends: allBackends(calls) });
    await expect(role(rerankReq("custom_openai"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("an UNWIRED backend fail-closes (a missing composition-root wire)", async () => {
    const role = createRerankRole({ backends: new Map() });
    await expect(role(rerankReq("vllm"))).rejects.toBeInstanceOf(ProviderError);
  });

  test("a backend that doesn't implement rerank fail-closes (not a call on undefined)", async () => {
    const role = createRerankRole({ backends: new Map([["openrouter", { key: "openrouter" }]]) });
    await expect(role(rerankReq("openrouter"))).rejects.toBeInstanceOf(ProviderError);
  });
});
