// chatHistoryText — the text of a history turn: its concatenated text parts. Image parts (D45) are
// wire-mapped per-backend by the translator when vision-input is wired; until then history is text-only
// and this IS the content. Shared infra-kit helper for the chat runners (strategy-isolated).
import type { ChatContentPart } from "../../contract/chat";

export function chatHistoryText(content: readonly ChatContentPart[]): string {
  let text = "";
  for (const part of content) {
    if (part.type === "text") {
      text += part.text;
    }
  }
  return text;
}
