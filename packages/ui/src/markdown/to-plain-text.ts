import { remark } from "remark";
import stripMarkdown from "strip-markdown";

const processor = remark().use(stripMarkdown);

/**
 * Markdown → plain text, via the SAME unified pipeline Streamdown uses (D54) — for previews/snippets/
 * notifications (recent-chats list, search results) where rendered markdown is wrong. Synchronous:
 * `remark`'s `processSync` runs the strip transform with no async plugins.
 *
 * Usage: `toPlainText("# Title\n\n**bold**")` → `"Title\n\nbold"`.
 */
export function toPlainText(markdown: string): string {
  return String(processor.processSync(markdown)).trim();
}
