// createImageEmbedRole — the `imageEmbed` role dispatcher (joint image+text → one shared vector space).
// Switches on `credential.source`; the firewall rejects max-pro-sub/custom_openai (mirrors embed). This
// mirror asserts the routed backend per permitted source + every fail-closed path of THIS dispatcher.

import type {
  ImageEmbedRequest,
  ImageEmbedResult,
  ProviderBackend,
  ResolvedCredential,
} from "@orb/server/infra/providers";
import { createImageEmbedRole, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

const IMAGE_EMBED_RESULT = {} as unknown as ImageEmbedResult;

/** A backend whose `imageEmbed` records `${key}:imageEmbed` so the routed selection is observable. */
function spy(key: ProviderBackend["key"], calls: string[]): ProviderBackend {
  return {
    key,
    imageEmbed: (): Promise<ImageEmbedResult> => {
      calls.push(`${key}:imageEmbed`);
      return Promise.resolve(IMAGE_EMBED_RESULT);
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

function imageEmbedReq(source: ResolvedCredential["source"]): ImageEmbedRequest {
  return {
    credential: cred(source),
    model: "m",
    input: { kind: "text", text: "x" },
  } as unknown as ImageEmbedRequest;
}

describe("createImageEmbedRole — source → the sealed imageEmbed backend", () => {
  test("openrouter, vllm, and local-light each route to their own backend's imageEmbed impl", async () => {
    const or: string[] = [];
    const vl: string[] = [];
    const ll: string[] = [];
    await Promise.all([
      createImageEmbedRole({ backends: allBackends(or) })(imageEmbedReq("openrouter")),
      createImageEmbedRole({ backends: allBackends(vl) })(imageEmbedReq("vllm")),
      createImageEmbedRole({ backends: allBackends(ll) })(imageEmbedReq("local-light")),
    ]);
    expect(or).toEqual(["openrouter:imageEmbed"]);
    expect(vl).toEqual(["vllm:imageEmbed"]);
    expect(ll).toEqual(["local-light:imageEmbed"]);
  });
});

describe("createImageEmbedRole — fail-closed (firewall + sealed dispatch)", () => {
  test("max-pro-sub is denied for imageEmbed (wrong-source-for-role)", async () => {
    const calls: string[] = [];
    const role = createImageEmbedRole({ backends: allBackends(calls) });
    await expect(role(imageEmbedReq("max-pro-sub"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("custom_openai is denied for imageEmbed (wrong-source-for-role)", async () => {
    const calls: string[] = [];
    const role = createImageEmbedRole({ backends: allBackends(calls) });
    await expect(role(imageEmbedReq("custom_openai"))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("an UNWIRED backend fail-closes (a missing composition-root wire)", async () => {
    const role = createImageEmbedRole({ backends: new Map() });
    await expect(role(imageEmbedReq("vllm"))).rejects.toBeInstanceOf(ProviderError);
  });

  test("a backend that doesn't implement imageEmbed fail-closes (not a call on undefined)", async () => {
    const role = createImageEmbedRole({ backends: new Map([["vllm", { key: "vllm" }]]) });
    await expect(role(imageEmbedReq("vllm"))).rejects.toBeInstanceOf(ProviderError);
  });
});
