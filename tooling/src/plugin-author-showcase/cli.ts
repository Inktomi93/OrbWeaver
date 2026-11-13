// plugin-author-showcase — compile the nine first-party showcase sources into deterministic runtime
// bundles, or verify that the ignored release tree matches those sources. Argv parse + dispatch only;
// the programmatic authoring surface is ./index.ts. `versions` compares the release receipt with the one a base
// ref holds (the newest release tag when none is named) and fails a bundle whose bytes changed under the same version.
//
// Exit: 0 built/current · 1 author diagnostics, stale bundles or an unbumped bundle · 2 the tool broke · 3 misuse.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { formatPluginAuthorDiagnostics } from "@orb/plugin-toolchain";
import { print, REPO_ROOT } from "../floor/artifacts/artifacts.ts";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { runTool, UsageError } from "../floor/cli/run-tool.ts";
import {
  compileShowcasePlugins,
  loadShowcaseRelease,
  showcaseBundleDirectory,
  staleShowcaseArtifacts,
  unbumpedShowcaseBundles,
  writeShowcaseArtifacts,
} from "./index.ts";

const USAGE = "usage: node tooling/src/plugin-author-showcase/cli.ts <build|check|versions [base ref]>";

const run = promisify(execFile);

async function git(...args: readonly string[]): Promise<string> {
  return (await run("git", [...args], { cwd: REPO_ROOT, maxBuffer: Number.MAX_SAFE_INTEGER })).stdout;
}

async function checkVersions(named: string | undefined): Promise<number> {
  const base = named ?? (await git("describe", "--tags", "--abbrev=0", "--match", "v*")).trim();
  const shipped = await loadShowcaseRelease((path) => git("show", `${base}:${path}`));
  const current = await loadShowcaseRelease((path) => readFile(join(REPO_ROOT, path), "utf8"));
  const unbumped = unbumpedShowcaseBundles(shipped, current);
  if (unbumped.length > 0) {
    const lines = unbumped.map((slug) => `  ${slug} (${current.versions[slug] ?? "no version"})`).join("\n");
    process.stderr.write(`showcase bundles changed since ${base} without a newer manifest version, so installs keep the old bytes:\n${lines}\n`);
    return EXIT.violations;
  }
  print(`checked ${Object.keys(current.receipt.bundles).length} showcase bundle versions against ${base}`);
  return EXIT.clean;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "versions" && rest.length <= 1) {
    return await checkVersions(rest[0]);
  }
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
