// The reference-link shapes the plain and framed budget tests render: one definition reused by many references.
import { REFERENCE_COPY_BUDGET } from "../../../packages/ui/src/markdown/reference-budget.ts";

export const REFERENCE_URL = "https://example.test/ledger";
export const REFERENCE_WORD = "ledger";

/** `count` references to one definition whose title is `titleChars` long, and how many of them may resolve. */
export function reusedReference(count: number, titleChars: number): { readonly source: string; readonly resolved: number } {
  const title = "T".repeat(titleChars);
  const cost = REFERENCE_URL.length + title.length;
  const source = `[a]: ${REFERENCE_URL} "${title}"\n\n${`[${REFERENCE_WORD}][a] `.repeat(count)}`;
  return { source, resolved: Math.min(count, Math.floor(REFERENCE_COPY_BUDGET / cost)) };
}
