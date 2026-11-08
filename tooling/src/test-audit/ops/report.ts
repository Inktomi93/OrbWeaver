// Text for the query verbs. Pure, so a test asserts what the operator reads.
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { JudgedEdge } from "../contract/types.ts";
import type { ReaderAgreement } from "./edges.ts";

refuseDirectInvocation(import.meta.url, "pnpm test-audit <verb>");

const SHORT_SHA = 10;
const PERCENT = 100;

function range(edge: JudgedEdge): string {
  return edge.startLine === null ? `${edge.path} (whole file)` : `${edge.path}:${String(edge.startLine)}-${String(edge.endLine)}`;
}

function staleness(edge: JudgedEdge): string {
  return edge.stale.length === 0 ? "current" : `STALE (${edge.stale.join(" and ")} changed)`;
}

/** One line per edge, grouped under its case; `empty` names what was asked when nothing matched. */
export function formatEdges(edges: readonly JudgedEdge[], empty: string): string {
  if (edges.length === 0) {
    return empty;
  }
  const lines: string[] = [];
  let last = "";
  for (const edge of edges) {
    if (edge.recordId !== last) {
      last = edge.recordId;
      lines.push(`${edge.recordId}  ${edge.testPath}  ${edge.caseName}`);
    }
    lines.push(`  ${range(edge)}  ${edge.source}@${edge.edgeRevision.slice(0, SHORT_SHA)}  ${staleness(edge)}`);
  }
  const stale = new Set(edges.filter((edge) => edge.stale.length > 0).map((edge) => edge.recordId));
  const cases = new Set(edges.map((edge) => edge.recordId));
  lines.push(`${String(cases.size)} case(s), ${String(stale.size)} stale`);
  return lines.join("\n");
}

const percent = (share: number): string => `${(share * PERCENT).toFixed(1)}%`;

export function formatAgreement(agreement: ReaderAgreement): string {
  return `reader ${agreement.reader}: recall ${percent(agreement.recall)}, precision ${percent(agreement.precision)} of the trace's production files, over ${String(agreement.testFiles)} test file(s)`;
}
