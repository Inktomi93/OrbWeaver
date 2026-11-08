// test-audit — argv parse and dispatch only; the programmatic surface is ./index.ts.
//
//   pnpm test-audit build --audit=<index.sqlite> [--codegraph=<db>] [--edges=<out>]   write the edge table
//   pnpm test-audit proves <path>[:<line>] [--edges=<db>]                            the cases that reach a file
//   pnpm test-audit touches <test-path> [--edges=<db>]                               what a test file's cases reach
//   pnpm test-audit bench [--codegraph=<db>] [--edges=<db>]                          CodeGraph's agreement with the trace
//
// Exit: 0 answered (an empty answer included) · 2 the tool broke · 3 misuse.
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { print } from "../floor/artifacts/artifacts.ts";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { runTool, UsageError } from "../floor/cli/run-tool.ts";
import { buildEdges, codegraphAgreement, formatAgreement, formatEdges, provesFile, touchedBy } from "./index.ts";

const USAGE = "usage: pnpm test-audit build --audit=<index.sqlite> | proves <path>[:<line>] | touches <test-path> | bench  [--edges=<db>] [--codegraph=<db>]";
const DEFAULT_EDGES = ".cache/test-audit/edges.sqlite";
const DEFAULT_CODEGRAPH = ".codegraph/codegraph.db";
const AT_LINE = /^(.+):(\d+)$/u;

function main(): number {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { audit: { type: "string" }, codegraph: { type: "string" }, edges: { type: "string" } },
  });
  // The pnpm script runs at the workspace root, so the defaults resolve inside the checkout it was run in.
  const repoRoot = process.cwd();
  const edgesPath = values.edges ?? join(repoRoot, DEFAULT_EDGES);
  const codegraphPath = values.codegraph ?? join(repoRoot, DEFAULT_CODEGRAPH);
  const [verb, subject] = positionals;
  if (verb === undefined) {
    throw new UsageError(USAGE);
  }
  switch (verb) {
    case "build": {
      if (values.audit === undefined) {
        throw new UsageError(`build reads the audit's index: --audit=<index.sqlite>\n${USAGE}`);
      }
      const summary = buildEdges({ repoRoot, auditPath: values.audit, codegraphPath, outPath: edgesPath });
      print(
        `wrote ${edgesPath}: ${String(summary.cases)} case(s), ${String(summary.traceEdges)} trace edge(s), ${String(summary.codegraphEdges)} codegraph edge(s), ${String(summary.unreached)} case(s) with no production edge, ${String(summary.droppedRefs)} trace citation(s) of a path the record's revision does not hold`,
      );
      return EXIT.clean;
    }
    case "proves": {
      if (subject === undefined) {
        throw new UsageError(`proves names a production path\n${USAGE}`);
      }
      const at = AT_LINE.exec(subject);
      const path = at?.[1] ?? subject;
      print(formatEdges(provesFile(repoRoot, edgesPath, path, at === null ? null : Number(at[2])), `no audited case reaches ${subject}`));
      return EXIT.clean;
    }
    case "touches": {
      if (subject === undefined) {
        throw new UsageError(`touches names a test file\n${USAGE}`);
      }
      print(formatEdges(touchedBy(repoRoot, edgesPath, subject), `no audited case lives in ${subject}`));
      return EXIT.clean;
    }
    case "bench":
      print(formatAgreement(codegraphAgreement(edgesPath, codegraphPath)));
      return EXIT.clean;
    default:
      throw new UsageError(USAGE);
  }
}

await runTool(main);
