// Knip owns liveness; this preprocessor admits only the recorded production debt and reports stale rows.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Issue, IssueType, Preprocessor, ReporterOptions } from "knip";

export const KNIP_BASELINE = "knip-production.baseline.json";
export const KNIP_FINDINGS = "reports/knip-production-findings.json";
/** The symbol and file issue types the production run judges and its baseline may admit. */
export const BASELINED_TYPES = ["files", "exports", "types", "nsExports", "nsTypes", "enumMembers", "namespaceMembers"] as const satisfies readonly IssueType[];

function keyOf(cwd: string, issue: Issue): string {
  return JSON.stringify([issue.type, relative(cwd, issue.filePath).replaceAll("\\", "/"), issue.parentSymbol ?? "", issue.symbol]);
}

function readBaseline(path: string): readonly string[] {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const baseline = Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  if (!Array.isArray(parsed) || baseline.length !== parsed.length || new Set(baseline).size !== baseline.length) {
    throw new Error(`${KNIP_BASELINE} must contain unique issue keys`);
  }
  return baseline;
}

/** Retain all findings for adjudication before applying the shrink-only production baseline. */
const preprocessKnip: Preprocessor = (data) => {
  if (!data.isProduction) {
    return data;
  }
  const baselinePath = join(data.cwd, KNIP_BASELINE);
  const baseline = readBaseline(baselinePath);
  const output = join(data.cwd, KNIP_FINDINGS);
  mkdirSync(join(data.cwd, "reports"), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ issues: data.issues, configurationHints: data.configurationHints, tagHints: [...data.tagHints] }, null, 2)}\n`);
  const admitted = new Set(baseline);
  const live = new Set<string>();
  const issues = { ...data.issues };
  const counters = { ...data.counters };
  for (const type of BASELINED_TYPES) {
    issues[type] = {};
    for (const [file, records] of Object.entries(data.issues[type])) {
      const remaining: Record<string, Issue> = {};
      for (const [symbol, issue] of Object.entries(records)) {
        const key = keyOf(data.cwd, issue);
        live.add(key);
        if (admitted.has(key)) {
          counters[type] -= 1;
        } else {
          remaining[symbol] = issue;
        }
      }
      if (Object.keys(remaining).length > 0) {
        issues[type][file] = remaining;
      }
    }
  }
  // A stale entry is an unused baseline key, not a tool failure; Knip's reporter and exit calculation own it.
  const stale = baseline.filter((key) => !live.has(key));
  for (const key of stale) {
    const symbol = `STALE baseline key: ${key}`;
    issues.exports[baselinePath] ??= {};
    const records = issues.exports[baselinePath];
    records[symbol] = { type: "exports", filePath: baselinePath, workspace: ".", symbol, severity: "error", fixes: [] };
    counters.exports += 1;
  }
  return { ...data, issues, counters } satisfies ReporterOptions;
};

export default preprocessKnip;
