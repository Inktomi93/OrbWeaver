// D321: every exported domain `*Service` verb must execute in the server suite; this judges the node shards' V8 reports.
// Listed unjudged by name, never passed: a verb read off a parameter or computed by an expression, a wrapper taking
// several functions of its own type or past the step bound, one function behind two verb names, a callable-and-data member.
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { runTool, UsageError } from "@orb/tooling/floor/cli/run-tool";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { readServiceVerbs } from "@orb/tooling/floor/testing/service-verbs";
import type { VerbVerdict } from "@orb/tooling/floor/testing/verb-coverage";
import { coverageReportSchema, judgeVerbCoverage } from "@orb/tooling/floor/testing/verb-coverage";

const SERVER_PROGRAM = "packages/server/tsconfig.json";
const USAGE = "ci-verb-coverage requires one coverage-final.json per node shard";

const label = (verdict: VerbVerdict): string => `${verdict.domain}.${verdict.verb} (declared on ${verdict.declaredIn})`;

await runTool(() => {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    throw new UsageError(USAGE);
  }
  const missing = paths.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    process.stderr.write(`[verb-coverage] missing shard coverage: ${missing.join(", ")}\n`);
    return 2;
  }
  const reports = paths.map((path) => coverageReportSchema.parse(JSON.parse(readFileSync(path, "utf8"))));
  const root = process.cwd();
  const project = createSemanticWorkspace({ root }).program(SERVER_PROGRAM)?.project();
  if (project === undefined) {
    throw new Error(`${SERVER_PROGRAM} is not a semantic analysis program`);
  }
  const { verdicts, unjudged } = judgeVerbCoverage(readServiceVerbs(project), reports, root);
  const misses = verdicts.filter(({ kind }) => kind === "uncollected" || kind === "unmatched");
  const unexecuted = verdicts.filter(({ kind }) => kind === "not-executed");
  for (const verdict of verdicts) {
    if (verdict.kind === "uncollected") {
      process.stderr.write(`[verb-coverage] uncollected: ${label(verdict)} — no shard reported ${verdict.file}\n`);
    } else if (verdict.kind === "unmatched") {
      process.stderr.write(`[verb-coverage] unmatched: ${label(verdict)} — no reported function starts at ${verdict.at}\n`);
    }
  }
  for (const verdict of unexecuted) {
    process.stdout.write(`[verb-coverage] NOT EXECUTED: ${label(verdict)}\n`);
  }
  for (const verb of unjudged) {
    process.stdout.write(`[verb-coverage] unjudged: ${verb.domain}.${verb.verb} — ${verb.reason}\n`);
  }
  process.stdout.write(
    `[verb-coverage] ${String(verdicts.length - unexecuted.length - misses.length)} executed · ${String(unexecuted.length)} not executed · ${String(misses.length)} unreadable · ${String(unjudged.length)} unjudged\n`,
  );
  if (misses.length > 0) {
    return 2;
  }
  return unexecuted.length > 0 ? 1 : 0;
});
