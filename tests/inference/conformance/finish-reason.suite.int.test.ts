// @subject packages/inference/src/contract/chat.ts
import type { Wire } from "@orb/contracts/inference";

import { NORMALIZED_FINISH_REASONS } from "@orb/contracts/inference";

import { expect } from "@orb/testkit/node/fixtures.ts";

import type { ChatScript } from "./runtime.fixtures.ts";

import { CONFORMANCE_WIRES, cellTest, driveChat } from "./runtime.fixtures.ts";

const BASE: Omit<ChatScript, "stop"> = { deltas: ["done"], tokensIn: 9, tokensOut: 4 };

function mappedStopFor(wire: Wire): string {
  if (wire === "google-generative-ai") {
    return "STOP";
  }
  return wire === "openai-compat" ? "stop" : "end_turn";
}

const UNRECOGNISED_STOP = "orb_unrecognised_stop_word";

const LEGITIMATE_OTHER_STOP = "error";

for (const wire of CONFORMANCE_WIRES) {
  cellTest(wire, "chat", "a recognised stop word folds through the SHARED map and the raw word survives beside it", async () => {
    const raw = mappedStopFor(wire);
    const { turn } = await driveChat(wire, { script: { ...BASE, stop: raw } });
    expect(NORMALIZED_FINISH_REASONS, "the normalized value is inside the closed vocabulary").toContain(turn.finishReason);
    expect(turn.finishReason, `"${raw}" is a normal termination on every wire`).toBe("stop");
    expect(turn.stopReason, "the provider's own word rides beside the normalized one as provenance").toBe(raw);
  });

  cellTest(wire, "chat", "an UNRECOGNISED stop word lands on the NAMED `other` arm, never null and never raw", async () => {
    const { turn } = await driveChat(wire, { script: { ...BASE, stop: UNRECOGNISED_STOP } });
    expect(turn.finishReason, "an unknown word is `other`, not absence").toBe("other");
    expect(turn.finishReason, "the raw word never becomes the normalized value").not.toBe(UNRECOGNISED_STOP);
    expect(turn.stopReason, "and the unknown word is still recoverable").toBe(UNRECOGNISED_STOP);
  });

  cellTest(wire, "chat", "a LEGITIMATE `other` finish is a real termination — the synthesized-finish guard must not eat it", async () => {
    // The negative control for `backends/v4/stream.ts::isSynthesizedFinish`. A provider that genuinely ends a
    // turn on `error` carries its raw word AND its token counts; the guard fires only when BOTH are absent.
    // If this arm ever reds, the truncation guard has started rejecting real terminations, which is a worse
    // defect than the one it was added to close.
    const { turn } = await driveChat(wire, { script: { ...BASE, stop: LEGITIMATE_OTHER_STOP } });
    expect(turn.finishReason, "a mapped-to-other word is still `other`").toBe("other");
    expect(turn.stopReason, "and it is a real termination, not a truncation").toBe(LEGITIMATE_OTHER_STOP);
    expect(turn.usage.tokensOut, "a real termination still reports its tokens").toBe(BASE.tokensOut);
  });
}
