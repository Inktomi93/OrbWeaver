#!/usr/bin/env node

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { compilePluginDirectory, formatPluginAuthorDiagnostics, packPluginDirectory, stalePluginArtifacts, writePluginArtifacts } from "./index.ts";
import { pluginAuthorSupportGuideIsCurrent, renderPluginAuthorSupport, writePluginAuthorSupportGuide } from "./support.ts";
import type { PluginAuthorSupportFormat } from "./support-model.ts";

const EXIT_VIOLATION = 1;
const EXIT_MISUSE = 3;
const USAGE = [
  "usage: orb-plugin <build|check|pack|support> [plugin-directory] [options]",
  "  build/check options: --source-dir <directory> --out-dir <directory> [--sdk <directory>]",
  "  pack options:       --source-dir <directory> --out <bundle.zip> [--sdk <directory>]",
  "  support options:    --format <markdown|json> [--write <path> | --check <path>]",
].join("\n");

const PROJECT_COMMANDS = ["build", "check", "pack"] as const;
type ProjectCommand = (typeof PROJECT_COMMANDS)[number];

interface ParsedProjectArgs {
  readonly command: ProjectCommand;
  readonly pluginDirectory: string;
  readonly sdkDirectory: string | undefined;
  readonly sourceDirectory: string;
  readonly outputDirectory: string;
  readonly bundlePath: string | undefined;
}

interface ParsedSupportArgs {
  readonly command: "support";
  readonly format: PluginAuthorSupportFormat;
  readonly writePath: string | undefined;
  readonly checkPath: string | undefined;
}

type ParsedArgs = ParsedProjectArgs | ParsedSupportArgs;

function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function requireOptionValue(args: readonly string[], cursor: number): string {
  const value = args[cursor + 1];
  if (value === undefined) {
    fail(USAGE, EXIT_MISUSE);
  }
  return value;
}

function parseSupportArgs(args: readonly string[]): ParsedSupportArgs {
  let format: PluginAuthorSupportFormat = "markdown";
  let writePath: string | undefined;
  let checkPath: string | undefined;
  for (let cursor = 0; cursor < args.length; cursor += 2) {
    const option = args[cursor];
    const value = requireOptionValue(args, cursor);
    if (option === "--format" && (value === "markdown" || value === "json")) {
      format = value;
    } else if (option === "--write") {
      writePath = resolve(value);
    } else if (option === "--check") {
      checkPath = resolve(value);
    } else {
      fail(USAGE, EXIT_MISUSE);
    }
  }
  if (writePath !== undefined && checkPath !== undefined) {
    fail("orb-plugin support accepts only one of --write or --check", EXIT_MISUSE);
  }
  return { command: "support", format, writePath, checkPath };
}

function isProjectCommand(value: string | undefined): value is ProjectCommand {
  return value === "build" || value === "check" || value === "pack";
}

interface ParsedProjectOption {
  readonly sdk?: string;
  readonly source?: string;
  readonly output?: string;
  readonly bundle?: string;
}

function parseProjectOption(option: string | undefined, value: string, command: ProjectCommand): ParsedProjectOption {
  if (option === "--sdk") {
    return { sdk: resolve(value) };
  }
  if (option === "--source-dir") {
    return { source: resolve(value) };
  }
  if (option === "--out-dir" && command !== "pack") {
    return { output: resolve(value) };
  }
  if (option === "--out" && command === "pack") {
    return { bundle: resolve(value) };
  }
  fail(USAGE, EXIT_MISUSE);
}

function parseProjectArgs(command: ProjectCommand, args: readonly string[]): ParsedProjectArgs {
  const first = args[0];
  let cursor = 0;
  let pluginDirectory = process.cwd();
  if (first !== undefined && !first.startsWith("--")) {
    pluginDirectory = resolve(first);
    cursor = 1;
  }
  let sdkDirectory: string | undefined;
  let sourceDirectory = pluginDirectory;
  let outputDirectory = join(pluginDirectory, ".orb-plugin", "build");
  let bundlePath: string | undefined;
  for (; cursor < args.length; cursor += 2) {
    const option = parseProjectOption(args[cursor], requireOptionValue(args, cursor), command);
    sdkDirectory = option.sdk ?? sdkDirectory;
    sourceDirectory = option.source ?? sourceDirectory;
    outputDirectory = option.output ?? outputDirectory;
    bundlePath = option.bundle ?? bundlePath;
  }
  if (command === "pack" && bundlePath === undefined) {
    fail(`orb-plugin pack requires --out <bundle.zip>\n${USAGE}`, EXIT_MISUSE);
  }
  return { command, pluginDirectory, sdkDirectory, sourceDirectory, outputDirectory, bundlePath };
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const command = args[0];
  if (command === "support") {
    return parseSupportArgs(args.slice(1));
  }
  if (!isProjectCommand(command)) {
    fail(USAGE, EXIT_MISUSE);
  }
  return parseProjectArgs(command, args.slice(1));
}

function installedSdkDirectory(pluginDirectory: string): string {
  const manifestPath = createRequire(join(pluginDirectory, "package.json")).resolve("@orb/plugin-sdk/package.json");
  return dirname(manifestPath);
}

function sdkDirectoryFor(parsed: ParsedProjectArgs): string {
  if (parsed.sdkDirectory !== undefined) {
    return parsed.sdkDirectory;
  }
  try {
    return installedSdkDirectory(parsed.pluginDirectory);
  } catch (error) {
    fail(`orb-plugin: cannot resolve @orb/plugin-sdk from ${parsed.pluginDirectory}: ${String(error)}`, EXIT_VIOLATION);
  }
}

async function writeAtomically(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function runSupport(parsed: ParsedSupportArgs): Promise<void> {
  if (parsed.writePath !== undefined) {
    await writePluginAuthorSupportGuide(parsed.writePath, parsed.format);
    process.stdout.write(`wrote ${parsed.writePath}\n`);
    return;
  }
  if (parsed.checkPath !== undefined) {
    if (!(await pluginAuthorSupportGuideIsCurrent(parsed.checkPath, parsed.format))) {
      fail(`stale plugin author support guide: ${parsed.checkPath}`, EXIT_VIOLATION);
    }
    process.stdout.write(`checked ${parsed.checkPath}\n`);
    return;
  }
  process.stdout.write(renderPluginAuthorSupport(parsed.format));
}

async function runPack(parsed: ParsedProjectArgs, project: Parameters<typeof packPluginDirectory>[0]): Promise<void> {
  const result = await packPluginDirectory(project);
  if (result.diagnostics.length > 0) {
    fail(formatPluginAuthorDiagnostics(parsed.pluginDirectory, result.diagnostics), EXIT_VIOLATION);
  }
  if (result.bundle === null || parsed.bundlePath === undefined) {
    fail("orb-plugin: pack produced no bundle", EXIT_VIOLATION);
  }
  await writeAtomically(parsed.bundlePath, result.bundle);
  process.stdout.write(`packed ${parsed.bundlePath} (${result.bundle.byteLength} bytes)\n`);
}

async function runBuildOrCheck(parsed: ParsedProjectArgs, project: Parameters<typeof compilePluginDirectory>[0]): Promise<void> {
  const result = await compilePluginDirectory(project);
  if (result.diagnostics.length > 0) {
    fail(formatPluginAuthorDiagnostics(parsed.pluginDirectory, result.diagnostics), EXIT_VIOLATION);
  }
  if (parsed.command === "build") {
    await writePluginArtifacts(result);
    process.stdout.write(`built ${result.artifacts.length} plugin artifact${result.artifacts.length === 1 ? "" : "s"}\n`);
    return;
  }
  const stale = await stalePluginArtifacts(result);
  if (stale.length > 0) {
    fail(`stale plugin artifacts:\n${stale.map((path) => `  ${relative(parsed.pluginDirectory, path)}`).join("\n")}`, EXIT_VIOLATION);
  }
  process.stdout.write(`checked ${result.artifacts.length} plugin artifact${result.artifacts.length === 1 ? "" : "s"}\n`);
}

async function runProject(parsed: ParsedProjectArgs): Promise<void> {
  const project = {
    pluginDirectory: parsed.pluginDirectory,
    sdkDirectory: sdkDirectoryFor(parsed),
    sourceDirectory: parsed.sourceDirectory,
    outputDirectory: parsed.outputDirectory,
  };
  if (parsed.command === "pack") {
    await runPack(parsed, project);
    return;
  }
  await runBuildOrCheck(parsed, project);
}

const parsedArgs = parseArgs(process.argv.slice(2));
if (parsedArgs.command === "support") {
  await runSupport(parsedArgs);
} else {
  await runProject(parsedArgs);
}
