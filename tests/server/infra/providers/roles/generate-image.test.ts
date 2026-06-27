// createGenerateImageRole — the `generateImage` role dispatcher (text → image). Hosted-primary: the
// firewall permits ONLY openrouter today; every other source is denied. It still switches on
// `credential.source` (forward-compat with future in-process image families). This mirror asserts the
// single permitted route + every fail-closed path of THIS dispatcher.

import type {
  ImageGenerateRequest,
  ImageGenerateResult,
  ProviderBackend,
  ResolvedCredential,
} from "@orb/server/infra/providers";
import { createGenerateImageRole, ProviderError } from "@orb/server/infra/providers";
import { describe, expect, test } from "vitest";

function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

const IMAGE_RESULT = {} as unknown as ImageGenerateResult;

/** A backend whose `generateImage` records `${key}:generateImage` so the route is observable. */
function spy(key: ProviderBackend["key"], calls: string[]): ProviderBackend {
  return {
    key,
    generateImage: (): Promise<ImageGenerateResult> => {
      calls.push(`${key}:generateImage`);
      return Promise.resolve(IMAGE_RESULT);
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

function imageReq(source: ResolvedCredential["source"]): ImageGenerateRequest {
  return { credential: cred(source), model: "m", prompt: "a cat" } as ImageGenerateRequest;
}

const NON_OPENROUTER: readonly ResolvedCredential["source"][] = [
  "vllm",
  "local-light",
  "max-pro-sub",
  "custom_openai",
];

describe("createGenerateImageRole — hosted-only routing", () => {
  test("openrouter routes to the openrouter backend's generateImage impl", async () => {
    const calls: string[] = [];
    const role = createGenerateImageRole({ backends: allBackends(calls) });
    await role(imageReq("openrouter"));
    expect(calls).toEqual(["openrouter:generateImage"]);
  });
});

describe("createGenerateImageRole — fail-closed (firewall + sealed dispatch)", () => {
  test("every non-openrouter source is firewall-denied, before any backend runs", async () => {
    const results = await Promise.all(
      NON_OPENROUTER.map(async (source) => {
        const calls: string[] = [];
        const role = createGenerateImageRole({ backends: allBackends(calls) });
        const rejected = await role(imageReq(source)).then(
          () => null,
          (err: unknown) => err,
        );
        return { rejected, calls };
      }),
    );
    for (const { rejected, calls } of results) {
      expect(rejected).toBeInstanceOf(ProviderError);
      expect(calls).toEqual([]);
    }
  });

  test("an UNWIRED openrouter backend fail-closes (a missing composition-root wire)", async () => {
    const role = createGenerateImageRole({ backends: new Map() });
    await expect(role(imageReq("openrouter"))).rejects.toBeInstanceOf(ProviderError);
  });

  test("a backend that doesn't implement generateImage fail-closes (not a call on undefined)", async () => {
    const role = createGenerateImageRole({
      backends: new Map([["openrouter", { key: "openrouter" }]]),
    });
    await expect(role(imageReq("openrouter"))).rejects.toBeInstanceOf(ProviderError);
  });
});
