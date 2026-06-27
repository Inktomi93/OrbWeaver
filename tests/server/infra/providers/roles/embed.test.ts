// createEmbedRole — the `embed` role dispatcher. Switches on `credential.source` (NOT vLLM-hard-pinned:
// a hosted key and both local engines are eligible). The firewall rejects max-pro-sub/custom_openai
// (those endpoints don't authenticate text embeddings). This mirror asserts the routed backend per
// permitted source + every fail-closed path of THIS dispatcher.

import type {
  EmbedRequest,
  EmbedResult,
  ProviderBackend,
  ResolvedCredential,
} from "@orb/server/infra/providers";
import { createEmbedRole, ProviderError } from "@orb/server/infra/providers";
import { describe, expect, test } from "vitest";

function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

const EMBED_RESULT = {} as unknown as EmbedResult;

/** A backend whose `embed` records `${key}:embed` so the routed selection is observable. */
function spy(key: ProviderBackend["key"], calls: string[]): ProviderBackend {
  return {
    key,
    embed: (): Promise<EmbedResult> => {
      calls.push(`${key}:embed`);
      return Promise.resolve(EMBED_RESULT);
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

function embedReq(source: ResolvedCredential["source"]): EmbedRequest {
  return { credential: cred(source), model: "m", input: "x" } as EmbedRequest;
}

describe("createEmbedRole — source → the sealed embed backend", () => {
  test("openrouter, vllm, and local-light each route to their own backend's embed impl", async () => {
    const or: string[] = [];
    const vl: string[] = [];
    const ll: string[] = [];
    await Promise.all([
      createEmbedRole({ backends: allBackends(or) })(embedReq("openrouter")),
      createEmbedRole({ backends: allBackends(vl) })(embedReq("vllm")),
      createEmbedRole({ backends: allBackends(ll) })(embedReq("local-light")),
    ]);
    expect(or).toEqual(["openrouter:embed"]);
    expect(vl).toEqual(["vllm:embed"]);
    expect(ll).toEqual(["local-light:embed"]);
  });
});

describe("createEmbedRole — fail-closed (firewall + sealed dispatch)", () => {
  test("max-pro-sub is denied for embed (the sub doesn't authenticate embed endpoints)", async () => {
    const calls: string[] = [];
    const role = createEmbedRole({ backends: allBackends(calls) });
    await expect(role(embedReq("max-pro-sub"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("custom_openai is denied for embed (a BYO chat endpoint doesn't serve embeddings)", async () => {
    const calls: string[] = [];
    const role = createEmbedRole({ backends: allBackends(calls) });
    await expect(role(embedReq("custom_openai"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("an UNWIRED backend fail-closes (a missing composition-root wire)", async () => {
    const role = createEmbedRole({ backends: new Map() });
    await expect(role(embedReq("openrouter"))).rejects.toBeInstanceOf(ProviderError);
  });

  test("a backend that doesn't implement embed fail-closes (not a call on undefined)", async () => {
    const role = createEmbedRole({ backends: new Map([["openrouter", { key: "openrouter" }]]) });
    await expect(role(embedReq("openrouter"))).rejects.toBeInstanceOf(ProviderError);
  });
});
