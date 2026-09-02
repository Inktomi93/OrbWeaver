// bug-reports — read the dev bug button's durable captures. Argv parse + dispatch ONLY (the five-slot cap);
// the programmatic surface is ./index.ts.
//
//   pnpm bug:reports                       list every captured report, newest first
//   pnpm bug:reports <id-or-unique-prefix> print that report's digest and name its JSON bundle
//
// Exit: 0 clean (including an EMPTY listing — nothing captured yet is an answer, not a failure) · 1 the ref
// matched nothing or was ambiguous · 2 the tool broke · 3 misuse.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { formatListing, formatShow, readBugReportMarkdown, readBugReports, resolveBugReport, resolvedSummary } from "./index.ts";

const USAGE = "usage: pnpm bug:reports [<id-or-unique-prefix>]";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    throw new UsageError(USAGE);
  }
  const ref = args[0];
  if (ref !== undefined && ref.startsWith("-")) {
    // There are no flags on purpose (list + show is the whole surface) — so a flag-looking argument is a
    // misuse, never a ref that happens to start with a dash.
    throw new UsageError(`${USAGE} — this reader takes no flags`);
  }
  // The repo root: this tool is invoked through its pnpm script, which pnpm runs at the workspace root, and
  // that is the same `process.cwd()` derivation the WRITER used to place the directory (`entry/lifecycle.ts`).
  const repoRoot = process.cwd();
  const listing = await readBugReports(repoRoot, Date.now());
  if (ref === undefined) {
    print(formatListing(listing));
    return EXIT.clean;
  }
  const summary = resolvedSummary(listing, ref);
  const resolution = resolveBugReport(listing, ref, await readBugReportMarkdown(summary?.markdownPath ?? null));
  print(formatShow(resolution));
  return resolution.ok ? EXIT.clean : EXIT.violations;
}

await runTool(main);
