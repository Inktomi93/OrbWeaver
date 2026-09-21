// CONFORMANCE — STREAMING COMPLETION. Every wire that serves `chat` must end a normal stream on a TERMINAL
// frame that carries the turn's accounting, and the reply the record commits must be exactly the deltas the
// caller was streamed. The two halves are one law: a wire whose reply disagrees with its deltas has shown
// the user text it did not persist (or persisted text it never showed), and a wire that treats a MISSING
// terminal frame as a normal end commits an empty reply as canon — #1400's defect class, the one a
// byte-equality wire pin cannot see.
//
// WHAT EACH PIN WOULD CATCH
//  · "deltas concatenate to the reply" — a reducer that accumulates from a different channel than it streams.
//    The agent-sdk wire genuinely uses two (`stream_event` frames drive `onDelta`; the `assistant` frame is
//    the canonical accumulation), so drift between them is real and nothing else in the tree sees it.
//  · "the terminal frame carries the accounting" — a wire that folds usage from somewhere other than the
//    frame that ends the turn, so a turn's tokens belong to a different turn.
//  · "a truncated stream FAILS CLOSED" — the #1400 arm. Delete `backends/v4/stream.ts`'s
//    `acc.finish === undefined` throw (hosted) or `backends/agent-sdk/runner.ts`'s `!acc.sawTerminalFrame`
//    throw (agent-sdk) and this is the only thing in the tree that reds: the turn RESOLVES with `reply: ""`
//    and every other assertion in this file still passes.

import type { Wire } from "@orb/contracts/inference";
import { NORMALIZED_FINISH_REASONS } from "@orb/contracts/inference";
import { expect } from "../../support/fixtures.ts";
import type { ChatScript } from "./_harness.ts";
import { CONFORMANCE_WIRES, cellTest, driveChat, settledProviderError } from "./_harness.ts";

const DELTAS = ["Con", "form", "ance."];
const REPLY = DELTAS.join("");
const COMPLETE: ChatScript = { deltas: DELTAS, stop: "stop", tokensIn: 11, tokensOut: 7 };

/** The anthropic wire spells its own stop words and `stop` is not one of them; the FOLD is pinned in
 *  `finish-reason.suite.test.ts`, so here the raw word only has to terminate the stream. */
function terminatedScript(wire: Wire): ChatScript {
  return wire === "anthropic-messages" ? { ...COMPLETE, stop: "end_turn" } : COMPLETE;
}

for (const wire of CONFORMANCE_WIRES) {
  cellTest(wire, "chat", "the deltas the caller saw are the reply the record commits", async () => {
    const { deltas, turn } = await driveChat(wire, { script: terminatedScript(wire) });
    expect(deltas.join(""), "streamed deltas").toBe(REPLY);
    expect(turn.reply, "committed reply").toBe(REPLY);
    expect(turn.usage.tokensIn, "tokensIn off the terminal frame").toBe(COMPLETE.tokensIn);
    expect(turn.usage.tokensOut, "tokensOut off the terminal frame").toBe(COMPLETE.tokensOut);
    expect(NORMALIZED_FINISH_REASONS, "finish is normalized").toContain(turn.finishReason);
  });

  cellTest(wire, "chat", "a stream that ends WITHOUT its terminal frame fails closed (#1400)", async () => {
    // The assertion is on the RESOLUTION as much as on the rejection: "it resolved with an empty reply" IS
    // the #1400 defect, and a bare `.rejects.toThrow()` accepts any rejection while saying nothing about a
    // resolution — which is the arm that ships a blank message as canon.
    const { error, value } = await settledProviderError(() => driveChat(wire, { script: { ...terminatedScript(wire), stop: null } }));
    expect(value, "resolved a truncated stream instead of failing closed").toBeUndefined();
    expect(error?.kind, "truncated-stream error kind").toBe("server");
    expect(error?.retryable, "truncated-stream retryability").toBe(true);
  });

  cellTest(wire, "chat", "an untyped callback request without a ChatId emits no fabricated delta (BB-004)", async () => {
    const { deltas, turn } = await driveChat(wire, { script: terminatedScript(wire), omitChatIdAtRuntime: true });
    expect(deltas, "callback invocations without identity").toEqual([]);
    // Delta delivery is suppressed; the provider result remains truthful and complete.
    expect(turn.reply).toBe(REPLY);
  });
}
