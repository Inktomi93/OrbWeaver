// The RUNNER_OVERRIDE dev/test seam: a deterministic, credit-free runChatTurn replay. These guard the
// tape parsing (prefix / bare / malformed → fallback), the cycling cursor, the streamed delta, the
// well-formed ChatResult (incl. the agent-sdk terminal-reason asymmetry), and the abort fail-closed.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { UserIntent } from "@orb/contracts/preset";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatDeltaEvent, ChatRequest } from "@orb/server/infra/providers";
import { buildScriptedOverrideRunner, ProviderError } from "@orb/server/infra/providers";
import { describe, expect, test } from "vitest";

// A minimal capability — the scripted runner never reads it, but ChatRequest requires it.
const CAPABILITY = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
} as unknown as ModelCapability;

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  const base = {
    credential: { source: "vllm", credentialId: null } as unknown as ResolvedCredential,
    model: castId<ModelId>("scripted-model"),
    capability: CAPABILITY,
    params: {} satisfies UserIntent,
    systemPrompt: { static: "", dynamic: "" },
    api: "chat-completions",
    history: [{ role: "user", content: "hi" }],
  } as unknown as ChatRequest;
  return { ...base, ...overrides } as ChatRequest;
}

describe("buildScriptedOverrideRunner — tape parsing", () => {
  test("a bare string is one canned reply (returned every turn)", async () => {
    const run = buildScriptedOverrideRunner("the one true answer");
    expect((await run(makeRequest())).reply).toBe("the one true answer");
    expect((await run(makeRequest())).reply).toBe("the one true answer");
  });

  test("a scripted-tape spec cycles its replies, wrapping past the end", async () => {
    const run = buildScriptedOverrideRunner('scripted-tape:{"replies":["a","b"]}');
    expect((await run(makeRequest())).reply).toBe("a");
    expect((await run(makeRequest())).reply).toBe("b");
    expect((await run(makeRequest())).reply).toBe("a");
  });

  test("malformed tape JSON degrades to the fallback reply (never throws)", async () => {
    const run = buildScriptedOverrideRunner("scripted-tape:{not json");
    expect((await run(makeRequest())).reply).toBe("(scripted reply)");
  });

  test("an empty replies list degrades to the fallback reply", async () => {
    const run = buildScriptedOverrideRunner('scripted-tape:{"replies":[]}');
    expect((await run(makeRequest())).reply).toBe("(scripted reply)");
  });
});

describe("buildScriptedOverrideRunner — turn behavior", () => {
  test("streams the reply as ONE text delta tagged with the request chatId", async () => {
    const deltas: ChatDeltaEvent[] = [];
    const run = buildScriptedOverrideRunner("hello");
    await run(makeRequest({ chatId: "chat_abc", onDelta: (event) => deltas.push(event) }));
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual({ chatId: "chat_abc", kind: "text", text: "hello" });
  });

  test("returns a well-formed ChatResult: stateless backend → null terminalReason, finish 'stop'", async () => {
    const result = await buildScriptedOverrideRunner("ok")(makeRequest());
    expect(result.terminalReason).toBeNull();
    expect(result.finishReason).toBe("stop");
    expect(result.numTurns).toBe(1);
    expect(result.usage.costUsd).toBe(0);
    expect(result.events).toEqual([]);
  });

  test("the agent-sdk api reports a terminal reason (production-parity asymmetry)", async () => {
    const result = await buildScriptedOverrideRunner("ok")(makeRequest({ api: "agent-sdk" }));
    expect(result.terminalReason).toBe("completed");
  });

  test("an already-aborted signal fail-closes with a typed ProviderError(kind:'aborted')", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = buildScriptedOverrideRunner("ok");
    await expect(run(makeRequest({ signal: controller.signal }))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});
