// The audit's production traces are prose an auditor wrote; this reads only the `path:line` and
// `path:start-end` citations in them, and a bare path as the whole file.
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { ProductionRef } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm test-audit <verb>");

/** A line or a range; an en dash reads as a hyphen. */
const SPAN = String.raw`\d+(?:[-–]\d+)?`;
/** A repository path under a source root, with optional lines right after it: `:12`, `:20-24`, or a list such as `:12, 15-18`. A list stays on its line: a number that opens the next line is prose. */
const CITATION = new RegExp(
  String.raw`((?:packages|tooling|scripts|tests)\/[\w./@[\]+-]*[\w\]-]\.(?:tsx?|mjs|cjs|js|css|json|sh|sql|html))(?::(${SPAN}(?:,[ \t]*${SPAN})*))?`,
  "gu",
);
const SPAN_BOUNDS = /(\d+)(?:[-–](\d+))?/u;
const TEST_ROOT = "tests/";

/** The production citations in one trace, each once. A citation under `tests/` names a test or a test helper,
 *  never production, so it is dropped. A bare path covers the whole file: both lines are null. A list of lines
 *  yields one citation per entry. */
export function productionRefs(trace: string): readonly ProductionRef[] {
  const seen = new Set<string>();
  const refs: ProductionRef[] = [];
  for (const match of trace.matchAll(CITATION)) {
    const [, path = "", spans] = match;
    if (path.startsWith(TEST_ROOT)) {
      continue;
    }
    const lines = spans === undefined ? [{ startLine: null, endLine: null }] : spans.split(",").map(lineSpan);
    for (const { startLine, endLine } of lines) {
      const key = `${path}:${String(startLine)}:${String(endLine)}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ path, startLine, endLine });
      }
    }
  }
  return refs;
}

function lineSpan(span: string): { readonly startLine: number; readonly endLine: number } {
  const [, start = "", end] = SPAN_BOUNDS.exec(span) ?? [];
  const startLine = Number(start);
  return { startLine, endLine: Math.max(startLine, Number(end ?? start)) };
}
