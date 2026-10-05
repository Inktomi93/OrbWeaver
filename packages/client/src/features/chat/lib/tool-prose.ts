import type { MessageView, ToolCallRecord } from "@orb/contracts/chat";

/** Editing always receives the canonical provider text, not display separators. */
export function toolBoundaryDisplayMessage(message: MessageView, editing: boolean): MessageView {
  return editing ? message : { ...message, content: separateToolProse(message.content, message.toolCalls) };
}

/** Presentation boundaries never change canonical provider bytes or their signatures. */
export function separateToolProse(content: string, records: readonly ToolCallRecord[]): string {
  const offsets = new Set(records.flatMap((record) => [record.textOffset, record.exchangeTextEnd].filter((offset) => offset !== undefined)));
  let displayed = content;
  for (const offset of [...offsets].toSorted((a, b) => b - a)) {
    if (offset <= 0 || offset >= content.length || /\s/.test(content.slice(offset - 1, offset + 1))) {
      continue;
    }
    displayed = `${displayed.slice(0, offset)}\n\n${displayed.slice(offset)}`;
  }
  return displayed;
}
