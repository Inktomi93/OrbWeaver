// plugin-author-showcase — compile the nine first-party showcase sources into deterministic runtime
// bundles, or verify that the ignored release tree matches those sources. Argv parse + dispatch only;
// the programmatic authoring surface is ./index.ts.
//
// Exit: 0 built/current · 1 author diagnostics or stale bundles · 2 the tool broke · 3 misuse.
import { relative } from "node:path";
import process from "node:process";
import { formatPluginAuthorDiagnostics } from "@orb/plugin-toolchain";
import { print, REPO_ROOT } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { compileShowcasePlugins, showcaseBundleDirectory, staleShowcaseArtifacts, writeShowcaseArtifacts } from "./index.ts";

const USAGE = "usage: node tooling/src/plugin-author-showcase/cli.ts <build|check>";

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if ((command !== "build" && command !== "check") || rest.length > 0) {
    throw new UsageError(USAGE);
  }

  const result = command === "build" ? await writeShowcaseArtifacts(REPO_ROOT) : await compileShowcasePlugins(REPO_ROOT);
  if (result.diagnostics.length > 0) {
    process.stderr.write(`${formatPluginAuthorDiagnostics(REPO_ROOT, result.diagnostics)}\n`);
    return EXIT.violations;
  }

  const bundleDirectory = showcaseBundleDirectory(REPO_ROOT);
  if (command === "check") {
    const stale = await staleShowcaseArtifacts(REPO_ROOT, bundleDirectory, result);
    if (stale.length > 0) {
      process.stderr.write(`stale showcase release artifacts:\n${stale.map((path) => `  ${relative(REPO_ROOT, path)}`).join("\n")}\n`);
      return EXIT.violations;
    }
    print(`checked ${result.bundles.length} deterministic showcase bundles in ${relative(REPO_ROOT, bundleDirectory)}`);
    return EXIT.clean;
  }

  print(`built ${result.bundles.length} deterministic showcase bundles in ${relative(REPO_ROOT, bundleDirectory)}`);
  return EXIT.clean;
}

if (import.meta.main) {
  await runTool(main);
}
