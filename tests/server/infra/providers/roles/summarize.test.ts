// createSummarizeRole — the `summarize` role dispatcher (a request-shaper over the chat role). Switches
// on `credential.source`; the firewall permits openrouter | vllm only — NEVER the metered sub, and
// NEVER the chat-less local-light tier (it has no chat surface to shape). This mirror asserts the routed
// backend per permitted source + every fail-closed path of THIS dispatcher.

import type {
  ProviderBackend,
  ResolvedCredential,
  SummarizeRequest,
  SummarizeResult,
} from "@orb/server/infra/providers";
import { createSummarizeRole, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

const SUMMARIZE_RESULT = {} as unknown as SummarizeResult;

/** A backend whose `summarize` records `${key}:summarize` so the routed selection is observable. */
function spy(key: ProviderBackend["key"], calls: string[]): ProviderBackend {
  return {
    key,
    summarize: (): Promise<SummarizeResult> => {
      calls.push(`${key}:summarize`);
      return Promise.resolve(SUMMARIZE_RESULT);
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

function summarizeReq(source: ResolvedCredential["source"]): SummarizeRequest {
  return {
    credential: cred(source),
    model: "m",
    inputs: [{ systemPrompt: "", userPrompt: "x" }],
  } as unknown as SummarizeRequest;
}

describe("createSummarizeRole — source → the sealed summarize backend", () => {
  test("openrouter and vllm each route to their own backend's summarize impl", async () => {
    const or: string[] = [];
    const vl: string[] = [];
    await Promise.all([
      createSummarizeRole({ backends: allBackends(or) })(summarizeReq("openrouter")),
      createSummarizeRole({ backends: allBackends(vl) })(summarizeReq("vllm")),
    ]);
    expect(or).toEqual(["openrouter:summarize"]);
    expect(vl).toEqual(["vllm:summarize"]);
  });
});

describe("createSummarizeRole — fail-closed (firewall + sealed dispatch)", () => {
  test("local-light is denied for summarize (the chat-less tier has no chat surface to shape)", async () => {
    const calls: string[] = [];
    const role = createSummarizeRole({ backends: allBackends(calls) });
    await expect(role(summarizeReq("local-light"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("max-pro-sub is denied for summarize (never the metered sub)", async () => {
    const calls: string[] = [];
    const role = createSummarizeRole({ backends: allBackends(calls) });
    await expect(role(summarizeReq("max-pro-sub"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("custom_openai is denied for summarize (not in the policy)", async () => {
    const calls: string[] = [];
    const role = createSummarizeRole({ backends: allBackends(calls) });
    await expect(role(summarizeReq("custom_openai"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("an UNWIRED backend fail-closes (a missing composition-root wire)", async () => {
    const role = createSummarizeRole({ backends: new Map() });
    await expect(role(summarizeReq("openrouter"))).rejects.toBeInstanceOf(ProviderError);
  });

  test("a backend that doesn't implement summarize fail-closes (not a call on undefined)", async () => {
    const role = createSummarizeRole({ backends: new Map([["vllm", { key: "vllm" }]]) });
    await expect(role(summarizeReq("vllm"))).rejects.toBeInstanceOf(ProviderError);
  });
});
