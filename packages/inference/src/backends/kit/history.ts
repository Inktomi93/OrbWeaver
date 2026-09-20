// The history-turn content projection shared below the backends — strategy-isolated in `backends/kit/` (the
// one sanctioned cross-backend home). ONE seam: `chatHistoryText`, the concatenated text parts (system and
// assistant rows, and any caller that needs the row's prose alone — cache measurement, emptiness checks).
//
// The multimodal sibling (`chatHistoryOpenAiContent`, the D45/#317 raw `image_url`/`video_url` content-part
// ARRAY) was deleted 2026-09-20 with its last consumers, the hand-rolled vLLM/custom-byo raw-wire runners.
// The SDK converter owns media now: `backends/v4/prompt.ts` emits `file` parts, and `openai-compat/body.ts`
// re-attaches the assistant image afterwards (§6.7/§8.0).
import type { ChatContentPart } from "@orb/contracts/chat";

export function chatHistoryText(content: readonly ChatContentPart[]): string {
  let text = "";
  for (const part of content) {
    if (part.type === "text") {
      text += part.text;
    }
  }
  return text;
}
