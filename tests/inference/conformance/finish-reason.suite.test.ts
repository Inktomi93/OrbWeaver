// CONFORMANCE — FINISH-REASON FOLDING. Every raw stop word a wire can emit must land INSIDE
// `NORMALIZED_FINISH_REASONS`, with `other` a NAMED arm for a value the map does not recognise — never a
// fallthrough, never `null`, and never the raw provider word leaking into a column with a SQL CHECK on it
// (`message_variants.finish_reason`). The raw word is not lost: it rides `stopReason` as declared-opaque
// provenance beside the normalized value, so a consumer can tell "stopped normally" from "stopped normally,
// and the provider called it `end_turn`".
//
// THE FOLD IS SHARED (`contract/chat.ts::FINISH_REASON_MAP`) and that is the whole claim under test: each
// wire must ROUTE THROUGH it rather than fold locally. A backend that mapped its own vocabulary would pass
// every shape check in the tree and quietly disagree with its siblings about what `filter` means.
//
// WHAT THESE PINS WOULD CATCH
//  · Make any wire return the raw word as `finishReason` and the "inside the closed vocabulary" arm reds —
//    which is also the arm standing between a provider rename and a CHECK-constraint violation on write.
//  · Change `normalizeFinishReason`'s `?? "other"` tail to `?? null` and the UNRECOGNISED arm reds on every
//    wire at once: an unknown stop word would become "the provider said nothing about why it stopped",
//    which is a different and wrong fact.
//  · Drop the raw word from `stopReason` and the provenance arm reds while the normalized value stays
//    perfectly valid — the shape of losing the evidence and keeping the summary.
//
// THIS FILE IS ALSO THE `stream.ts` GUARD'S NEGATIVE CONTROL. The synthesized-finish guard added there
// fires on "no raw stop word AND no token counts". The UNRECOGNISED arm below sends a raw word AND tokens
// and must pass; the LEGITIMATE-`other` arm sends a raw word the map folds TO `other` and must also pass.
// Without those two, a guard that rejected every real termination would look exactly as green as a correct
// one.

import type { Wire } from "@orb/contracts/inference";
import { NORMALIZED_FINISH_REASONS } from "@orb/contracts/inference";
import { expect } from "../../support/fixtures.ts";
import type { ChatScript } from "./_harness.ts";
import { CONFORMANCE_WIRES, cellTest, driveChat } from "./_harness.ts";

const BASE: Omit<ChatScript, "stop"> = { deltas: ["done"], tokensIn: 9, tokensOut: 4 };

/** A raw word the shared map RECOGNISES, in each wire's own vocabulary — the fixture is per-wire because the
 *  provider vocabularies genuinely differ; the EXPECTATION is the shared map's, which is the point. */
function mappedStopFor(wire: Wire): string {
  return wire === "openai-compat" ? "stop" : "end_turn";
}

/** A word no provider spells and the map does not hold. The `other` arm must absorb it BY NAME. */
const UNRECOGNISED_STOP = "orb_unrecognised_stop_word";
/** A word the map holds and folds TO `other` — a LEGITIMATE `other`, distinct from the unrecognised one. */
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
