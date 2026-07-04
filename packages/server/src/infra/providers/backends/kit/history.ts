// chatHistoryText — the text of a history turn: its concatenated text parts. Image parts (D45) are
// wire-mapped per-backend by the translator when vision-input is wired; until then history is text-only
// and this IS the content. Shared infra-kit helper for the chat runners (strategy-isolated).
import type { ChatContentPart } from "@orb/contracts/chat";
import type { HistoryRole } from "../../contract/chat";

export function chatHistoryText(content: readonly ChatContentPart[]): string {
  let text = "";
  for (const part of content) {
    if (part.type === "text") {
      text += part.text;
    }
  }
  return text;
}

/** FLAG[PD-54] — the T1→T2 bridge. The wire contract carries the `tool` role (D48), but each translator's
 *  dialect mapping for a tool exchange lands with T2; NO producer exists until the recurse loop (T4), so a
 *  tool-role turn reaching a translator today is a sequencing bug, not a degradable input — throw, never
 *  silently reshape. T2 deletes this call at each site as it lands the real mapping. */
export function assertMappedHistoryRole(role: HistoryRole): "user" | "assistant" {
  if (role === "tool") {
    throw new Error("tool-role history turn reached a translator before its T2 mapping (PD-54)");
  }
  return role;
}
