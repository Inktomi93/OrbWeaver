// D321: a domain verb is executed when any shard's V8 coverage counts a call of the function it resolves to.
// A resolved verb whose file or function the coverage does not carry is a loud miss, never a pass.
import { relative } from "node:path";
import type { Node } from "ts-morph";
import { z } from "zod";
import type { ResolvedServiceVerb, ServiceVerb, ServiceVerbCensus } from "./service-verbs.ts";

/** Where each node shard writes its V8 coverage, under its own reports directory. */
export const VERB_COVERAGE_DIR = "reports/verb-coverage";
/** What the shards collect: every package source, so a verb implemented outside the server package still has a range. */
export const VERB_COVERAGE_SCOPE = "packages/*/src/**/*.ts";

const positionSchema = z.object({ line: z.number().int(), column: z.number().int().nullable() });
const rangeSchema = z.object({ start: positionSchema, end: positionSchema });
const fileCoverageSchema = z.object({
  fnMap: z.record(z.string(), z.object({ name: z.string(), loc: rangeSchema })),
  f: z.record(z.string(), z.number().int().nonnegative()),
});
export const coverageReportSchema = z.record(z.string(), fileCoverageSchema);
export type CoverageReport = z.infer<typeof coverageReportSchema>;

export type VerbVerdict =
  | (ResolvedServiceVerb & { readonly kind: "executed" })
  | (ResolvedServiceVerb & { readonly kind: "not-executed" })
  | (ServiceVerb & { readonly kind: "uncollected"; readonly file: string })
  | (ServiceVerb & { readonly kind: "unmatched"; readonly at: string });

export interface VerbCoverageJudgment {
  readonly verdicts: readonly VerbVerdict[];
  readonly unjudged: ServiceVerbCensus["unjudged"];
}

interface FunctionSpan {
  readonly file: string;
  readonly start: Position;
  readonly end: Position;
}

interface Position {
  readonly line: number;
  readonly column: number;
}

function span(fn: Node, root: string): FunctionSpan {
  const source = fn.getSourceFile();
  // ts-morph columns are 1-based; Istanbul columns are 0-based.
  const at = (pos: number): Position => {
    const { line, column } = source.getLineAndColumnAtPos(pos);
    return { line, column: column - 1 };
  };
  return { file: relative(root, source.getFilePath()), start: at(fn.getStart()), end: at(fn.getEnd()) };
}

const compare = (left: Position, right: Position): number => left.line - right.line || left.column - right.column;

/** One count per report that carries the file: its earliest function inside the span. A remapped V8 range can
 *  start anywhere in the function's header or at its body, but never before a function nested inside it. */
function callCounts(reports: readonly CoverageReport[], at: FunctionSpan): number[] | "uncollected" | "unmatched" {
  const files = reports.flatMap((report) => Object.entries(report).filter(([path]) => path === at.file || path.endsWith(`/${at.file}`)));
  if (files.length === 0) {
    return "uncollected";
  }
  const counts = files.flatMap(([, coverage]) => {
    const inside = Object.entries(coverage.fnMap).flatMap(([id, entry]) => {
      const { line, column } = entry.loc.start;
      const position = { line, column: column ?? 0 };
      return compare(at.start, position) <= 0 && compare(position, at.end) <= 0 ? [{ position, count: coverage.f[id] ?? 0 }] : [];
    });
    const outermost = inside.toSorted((left, right) => compare(left.position, right.position))[0];
    return outermost === undefined ? [] : [outermost.count];
  });
  return counts.length === 0 ? "unmatched" : counts;
}

function judge(verb: ResolvedServiceVerb, reports: readonly CoverageReport[], root: string): VerbVerdict {
  let executed = false;
  for (const fn of verb.functions) {
    const at = span(fn, root);
    const counts = callCounts(reports, at);
    if (counts === "uncollected") {
      return { domain: verb.domain, service: verb.service, verb: verb.verb, declaredIn: verb.declaredIn, kind: "uncollected", file: at.file };
    }
    if (counts === "unmatched") {
      return {
        domain: verb.domain,
        service: verb.service,
        verb: verb.verb,
        declaredIn: verb.declaredIn,
        kind: "unmatched",
        at: `${at.file}:${String(at.start.line)}`,
      };
    }
    executed ||= counts.some((count) => count > 0);
  }
  return { ...verb, kind: executed ? "executed" : "not-executed" };
}

/** Judge every resolved verb against the union of the shards' reports. */
export function judgeVerbCoverage(census: ServiceVerbCensus, reports: readonly CoverageReport[], root: string): VerbCoverageJudgment {
  return { verdicts: census.resolved.map((verb) => judge(verb, reports, root)), unjudged: census.unjudged };
}
