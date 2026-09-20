// The history-turn content projections shared by the OpenAI-compatible RAW-wire runners (vLLM chat,
// custom-byo) — strategy-isolated in `backends/kit/` (the one sanctioned cross-backend home). Two seams:
//   • `chatHistoryText` — the concatenated text parts (system/assistant rows, and any caller that needs
//     the row's prose alone — cache measurement, emptiness checks).
//   • `chatHistoryOpenAiContent` — the D45/#317 multimodal send: a turn carrying image/video parts becomes
//     the OpenAI-compatible content-part ARRAY (`text` / `image_url` / `video_url` — vLLM's documented
//     multimodal extension carries `video_url`, and the engine's launch-time frame sampler consumes it);
//     a text-only turn stays a PLAIN STRING, byte-identical to the pre-multimodal wire (prefix caches and
//     the cache-breakpoint placer both key on string content — array-ing every row would break both).
// The OpenRouter runners do NOT use these shapes — the SDK's camelCase content types are built in
// `openrouter/runners/chat/shared.ts` and serialized by the SDK's own outbound schema.
import type { ChatContentPart } from "@orb/contracts/chat";
import type { OpenAiRawContentPart } from "../../contract/chat.ts";

export function chatHistoryText(content: readonly ChatContentPart[]): string {
  let text = "";
  for (const part of content) {
    if (part.type === "text") {
      text += part.text;
    }
  }
  return text;
}

/** A turn's OpenAI-compatible content: the plain string when no media rides (byte-stable — see header),
 *  else the content-part array ({@link OpenAiRawContentPart}, providers contract) in span order with a
 *  trailing/interleaved `text` part per text run. */
export function chatHistoryOpenAiContent(content: readonly ChatContentPart[]): string | OpenAiRawContentPart[] {
  if (!content.some((part) => part.type === "image" || part.type === "video")) {
    return chatHistoryText(content);
  }
  const parts: OpenAiRawContentPart[] = [];
  for (const part of content) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text });
    } else if (part.type === "image") {
      parts.push({ type: "image_url", image_url: { url: part.url } });
    } else if (part.type === "video") {
      parts.push({ type: "video_url", video_url: { url: part.url } });
    }
    // tool-call / tool-result: message-level seams, not content parts (see the type's doc).
  }
  return parts;
}
