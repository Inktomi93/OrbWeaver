// @subject packages/inference/src/backends/v4/stream.ts
// @subject packages/inference/src/backends/agent-sdk/runner.ts
import type { Wire } from "@orb/contracts/inference";

import { NORMALIZED_FINISH_REASONS } from "@orb/contracts/inference";

import { expect } from "@orb/testkit/node";

import type { ChatScript } from "./runtime.fixtures.ts";

import { CONFORMANCE_CHAT_ROUTES, cellTest, driveChat, settledProviderError } from "./runtime.fixtures.ts";

const DELTAS = ["Con", "form", "ance."];

const REPLY = DELTAS.join("");

const COMPLETE: ChatScript = { deltas: DELTAS, stop: "stop", tokensIn: 11, tokensOut: 7 };

function terminatedScript(wire: Wire): ChatScript {
  return wire === "anthropic-messages" ? { ...COMPLETE, stop: "end_turn" } : COMPLETE;
}

for (const route of CONFORMANCE_CHAT_ROUTES) {
  const { wire } = route;
  cellTest(route, "chat", "the deltas the caller saw are the reply the record commits", async () => {
    const { deltas, turn } = await driveChat(route, { script: terminatedScript(wire) });
    expect(deltas.join(""), "streamed deltas").toBe(REPLY);
    expect(turn.reply, "committed reply").toBe(REPLY);
    expect(turn.usage.tokensIn, "tokensIn off the terminal frame").toBe(COMPLETE.tokensIn);
    expect(turn.usage.tokensOut, "tokensOut off the terminal frame").toBe(COMPLETE.tokensOut);
    expect(NORMALIZED_FINISH_REASONS, "finish is normalized").toContain(turn.finishReason);
  });

  cellTest(route, "chat", "a stream that ends WITHOUT its terminal frame fails closed (#1400)", async () => {
    // The assertion is on the RESOLUTION as much as on the rejection: "it resolved with an empty reply" IS
    // the #1400 defect, and a bare `.rejects.toThrow()` accepts any rejection while saying nothing about a
    // resolution — which is the arm that ships a blank message as canon.
    const { error, value } = await settledProviderError(() => driveChat(route, { script: { ...terminatedScript(wire), stop: null } }));
    expect(value, "resolved a truncated stream instead of failing closed").toBeUndefined();
    expect(error?.kind, "truncated-stream error kind").toBe("server");
    expect(error?.retryable, "truncated-stream retryability").toBe(true);
  });

  cellTest(route, "chat", "an untyped callback request without a ChatId emits no fabricated delta (BB-004)", async () => {
    const { deltas, turn } = await driveChat(route, { script: terminatedScript(wire), omitChatIdAtRuntime: true });
    expect(deltas, "callback invocations without identity").toEqual([]);
    // Delta delivery is suppressed; the provider result remains truthful and complete.
    expect(turn.reply).toBe(REPLY);
  });
}
