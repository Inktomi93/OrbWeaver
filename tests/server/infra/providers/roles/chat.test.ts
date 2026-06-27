// createChatRole — the `chat` role dispatcher. Unique among the roles: it routes on the (api, source)
// pairing via `deriveRunner` (the others switch on source alone), runs the firewall consent belt, and
// fail-closes on an invalid (api, source) pairing even when the firewall ALLOWS the source. This mirror
// asserts the actual backend selected per pairing + every fail-closed path of THIS dispatcher.

import type {
  ChatRequest,
  ChatResult,
  ProviderBackend,
  ResolvedCredential,
} from "@orb/server/infra/providers";
import { createChatRole, ProviderError } from "@orb/server/infra/providers";
import { describe, expect, test } from "vitest";

// Dispatch + firewall read only `credential.source` (+ api/consent); esbuild-only tests, so a cast keeps
// the fakes terse (the brand is irrelevant at runtime).
function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

const CHAT_RESULT = { reply: "ok" } as unknown as ChatResult;

/** A backend whose `runChatTurn` records `${key}:chat` so the routed selection is observable. */
function spy(key: ProviderBackend["key"], calls: string[]): ProviderBackend {
  return {
    key,
    runChatTurn: (): Promise<ChatResult> => {
      calls.push(`${key}:chat`);
      return Promise.resolve(CHAT_RESULT);
    },
  };
}

/** A registry wired with every chat-eligible backend, each a spy into `calls`. */
function allBackends(calls: string[]): Map<ProviderBackend["key"], ProviderBackend> {
  return new Map([
    ["openrouter", spy("openrouter", calls)],
    ["vllm", spy("vllm", calls)],
    ["custom-openai", spy("custom-openai", calls)],
    ["agent-sdk", spy("agent-sdk", calls)],
  ]);
}

function chatReq(over: Partial<ChatRequest>): ChatRequest {
  return {
    api: "chat-completions",
    credential: cred("openrouter"),
    model: "m",
    ...over,
  } as ChatRequest;
}

/** Bind a fresh chat role over a fresh `calls` sink and run one request; returns the recorded calls. */
async function route(over: Partial<ChatRequest>): Promise<readonly string[]> {
  const calls: string[] = [];
  const role = createChatRole({ backends: allBackends(calls) });
  await role(chatReq(over));
  return calls;
}

describe("createChatRole — (api, source) → the sealed backend", () => {
  test("chat-completions: each source routes to its own stateless backend", async () => {
    const [or, vl, co] = await Promise.all([
      route({ api: "chat-completions", credential: cred("openrouter") }),
      route({ api: "chat-completions", credential: cred("vllm") }),
      route({ api: "chat-completions", credential: cred("custom_openai") }),
    ]);
    expect(or).toEqual(["openrouter:chat"]);
    expect(vl).toEqual(["vllm:chat"]);
    expect(co).toEqual(["custom-openai:chat"]);
  });

  test("agent-sdk api: the OR skin and local vllm both route to the ONE agent-sdk backend", async () => {
    const [skin, loopback] = await Promise.all([
      route({ api: "agent-sdk", credential: cred("openrouter") }),
      route({ api: "agent-sdk", credential: cred("vllm") }),
    ]);
    expect(skin).toEqual(["agent-sdk:chat"]);
    expect(loopback).toEqual(["agent-sdk:chat"]);
  });

  test("agent-sdk + max-pro-sub WITH owner consent routes to the agent-sdk backend", async () => {
    const calls = await route({
      api: "agent-sdk",
      credential: cred("max-pro-sub"),
      ownerConsented: true,
    });
    expect(calls).toEqual(["agent-sdk:chat"]);
  });

  test("the responses api is OpenRouter-only — openrouter routes, no other backend fires", async () => {
    const calls = await route({ api: "responses", credential: cred("openrouter") });
    expect(calls).toEqual(["openrouter:chat"]);
  });
});

describe("createChatRole — fail-closed (firewall + sealed dispatch)", () => {
  test("max-pro-sub without consent is refused at the firewall, before any backend runs", async () => {
    const calls: string[] = [];
    const role = createChatRole({ backends: allBackends(calls) });
    await expect(
      role(chatReq({ api: "agent-sdk", credential: cred("max-pro-sub") })),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("local-light is not in the chat source policy → firewall-denied (fail-closed)", async () => {
    const calls: string[] = [];
    const role = createChatRole({ backends: allBackends(calls) });
    await expect(
      role(chatReq({ api: "chat-completions", credential: cred("local-light") })),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("firewall-ALLOWED source on an INVALID pairing still fail-closes at deriveRunner", async () => {
    // chat policy permits max-pro-sub (consent ON here), but chat-completions × max-pro-sub is an
    // invalid pairing — the sub is reachable ONLY through agent-sdk. deriveRunner must throw.
    const calls: string[] = [];
    const role = createChatRole({ backends: allBackends(calls) });
    await expect(
      role(
        chatReq({ api: "chat-completions", credential: cred("max-pro-sub"), ownerConsented: true }),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);
  });

  test("an UNWIRED backend fail-closes (a missing composition-root wire, not a silent default)", async () => {
    const role = createChatRole({ backends: new Map() });
    await expect(
      role(chatReq({ api: "chat-completions", credential: cred("openrouter") })),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("a backend that doesn't implement runChatTurn fail-closes (not a call on undefined)", async () => {
    const role = createChatRole({ backends: new Map([["openrouter", { key: "openrouter" }]]) });
    await expect(
      role(chatReq({ api: "chat-completions", credential: cred("openrouter") })),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
