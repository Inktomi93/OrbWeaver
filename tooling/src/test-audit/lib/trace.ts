// The audit's production traces are prose an auditor wrote; this reads only the `path:line` and
// `path:start-end` citations in them, and a bare path as the whole file.
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { ProductionRef } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm test-audit <verb>");

/** A repository path under a source root, with an optional `:line` or `:start-end` right after it. */
const CITATION = /((?:packages|tooling|scripts|tests)\/[\w./@[\]+-]*[\w\]-]\.(?:tsx?|mjs|cjs|js|css|json|sh|sql|html))(?::(\d+)(?:-(\d+))?)?/gu;
const TEST_ROOT = "tests/";

/** The production citations in one trace, each once. A citation under `tests/` names a test or a test helper,
 *  never production, so it is dropped. A bare path covers the whole file: both lines are null. */
export function productionRefs(trace: string): readonly ProductionRef[] {
  const seen = new Set<string>();
  const refs: ProductionRef[] = [];
  for (const match of trace.matchAll(CITATION)) {
    const [, path = "", start, end] = match;
    if (path.startsWith(TEST_ROOT)) {
      continue;
    }
    const startLine = start === undefined ? null : Number(start);
    const endLine = startLine === null ? null : Math.max(startLine, Number(end ?? start));
    const key = `${path}:${String(startLine)}:${String(endLine)}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ path, startLine, endLine });
    }
  }
  return refs;
}
