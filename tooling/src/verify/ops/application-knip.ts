// Knip discovers scripts and exports before it reads source. The private native workspace separates
// those implementation entry points without hiding source files or altering package resolution.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { Node, SyntaxKind } from "ts-morph";
import { z } from "zod";
import ordinaryConfig from "../../../../knip.ts";
import type { ApplicationSubjects } from "../contract/application.ts";
import { APPLICATION_TEST_CONFIGS } from "../contract/application.ts";
import type { ConfigSnapshotTransaction } from "../contract/config-snapshot.ts";
import { PACKAGE_RESOURCE_PATHS } from "../contract/resource-config.ts";
import { projectApplicationKnipScript } from "../lib/application-knip-script.ts";
import { parseScratch } from "../lib/comment-spans.ts";
import { aggregateExit, asViolations } from "../lib/exit-classifiers.ts";
import { stagesForTier } from "../lib/registry.ts";
import { materializeConfigSnapshotTransaction } from "./config-snapshot-transaction.ts";

refuseDirectInvocation(import.meta.url, "pnpm exec node tooling/src/verify/cli.ts application-static knip");

const manifestSchema = z.object({ name: z.string().min(1), scripts: z.record(z.string(), z.string()).optional() }).catchall(z.json());
const CONFIG = "knip.application.json";
const KNIP_METADATA_VERSION = "6.37.0";
const KNIP_PLUGIN_METADATA = "dist/types/PluginNames.js";

/** Read the generated census the pinned native validator actually uses, without executing private code. */
export function applicationKnipPluginNames(root: string): readonly string[] {
  const entry = createRequire(join(root, "package.json")).resolve("knip");
  const directory = resolve(dirname(entry), "..");
  const manifest = z
    .object({ name: z.literal("knip"), version: z.literal(KNIP_METADATA_VERSION) })
    .safeParse(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")));
  if (!manifest.success) {
    throw new Error(
      `application Knip metadata adapter requires installed knip@${KNIP_METADATA_VERSION}; requalify the native plugin census before changing versions`,
    );
  }
  const source = parseScratch(readFileSync(join(directory, KNIP_PLUGIN_METADATA), "utf8"));
  const statement = source.getStatements()[0];
  if (
    source.getStatements().length !== 1 ||
    statement === undefined ||
    !Node.isVariableStatement(statement) ||
    !statement.getModifiers().some((modifier) => modifier.getKind() === SyntaxKind.ExportKeyword)
  ) {
    throw new Error(`application Knip ${KNIP_PLUGIN_METADATA} is not its supported exported literal tuple`);
  }
  const declarations = statement.getDeclarations();
  const declaration = declarations[0];
  const value = declaration?.getInitializer();
  if (declarations.length !== 1 || declaration?.getName() !== "pluginNames" || value === undefined || !Node.isArrayLiteralExpression(value)) {
    throw new Error(`application Knip ${KNIP_PLUGIN_METADATA} has an unsupported pluginNames declaration`);
  }
  const names = value.getElements().map((element) => {
    if (!Node.isStringLiteral(element) || element.getLiteralValue().trim().length === 0) {
      throw new Error(`application Knip ${KNIP_PLUGIN_METADATA} has a nonliteral or empty plugin name`);
    }
    return element.getLiteralValue();
  });
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error(`application Knip ${KNIP_PLUGIN_METADATA} has an empty or duplicate plugin census`);
  }
  return names;
}

function rootApplicationScripts(): ReadonlySet<string> {
  return new Set([
    "build",
    ...stagesForTier("full").flatMap(({ applicationArgv }) =>
      applicationArgv !== undefined && applicationArgv !== "implementation-only" && applicationArgv[0] === "pnpm" ? [applicationArgv[1] ?? ""] : [],
    ),
  ]);
}

function projectManifest(root: string, path: string, subjects: ApplicationSubjects): string {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(root, path), "utf8")));
  const scripts = manifest.scripts ?? {};
  const selected = rootApplicationScripts();
  const members = new Set(subjects.files);
  const authored = new Set(subjects.inventory.paths);
  const isToolingLauncher = (specifier: string): boolean => {
    const target = relative(root, resolve(root, dirname(path), specifier)).replaceAll("\\", "/");
    if (members.has(target)) {
      return false;
    }
    if (isAbsolute(target) || target.startsWith("../") || !authored.has(target) || !(target.startsWith("tooling/") || target.startsWith("scripts/"))) {
      throw new Error(`application Knip cannot classify launcher ${path}: ${specifier}`);
    }
    return true;
  };
  const projected = {
    ...Object.fromEntries(Object.entries(manifest).filter(([key]) => path !== "tooling/package.json" || key !== "exports")),
    scripts: Object.fromEntries(
      Object.entries(scripts)
        .filter(([name]) => path === "package.json" && selected.has(name))
        .map(([name, script]) => [name, projectApplicationKnipScript(script, isToolingLauncher)]),
    ),
  };
  if (path === "tooling/package.json") {
    for (const key of ["main", "module", "bin", "types", "typings"]) {
      if (manifest[key] !== undefined) {
        throw new Error(`application Knip has unclassified tooling manifest discovery: ${key}`);
      }
    }
    const imports = z.record(z.string(), z.json()).optional().parse(manifest["imports"]);
    if (Object.keys(imports ?? {}).some((key) => !key.includes("*"))) {
      throw new Error("application Knip has unclassified exact tooling imports discovery");
    }
  }
  return `${JSON.stringify(projected)}\n`;
}

function linkInstalledModules(original: string, target: string): void {
  if (!existsSync(original)) {
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(original, { withFileTypes: true })) {
    const source = join(original, entry.name);
    const destination = join(target, entry.name);
    if (entry.name.startsWith("@")) {
      linkInstalledModules(source, destination);
    } else if (!existsSync(destination)) {
      symlinkSync(realpathSync(source), destination, entry.isFile() ? "file" : "dir");
    }
  }
}

function preserveWorkspaceResolution(root: string, stage: string): void {
  const manifests = Object.values(PACKAGE_RESOURCE_PATHS).filter((path) => existsSync(join(root, path)));
  const workspaces = manifests.map((path) => ({ path, name: manifestSchema.parse(JSON.parse(readFileSync(join(root, path), "utf8"))).name }));
  const tooling = workspaces.find(({ path }) => path === "tooling/package.json");
  if (tooling !== undefined) {
    // Removing discovery exports must not narrow resolution: the native resolver reads the untouched facade.
    const facade = join(stage, "node_modules", tooling.name);
    rmSync(facade, { force: true });
    mkdirSync(facade, { recursive: true });
    writeFileSync(join(facade, "package.json"), readFileSync(join(root, tooling.path)));
    symlinkSync(relative(facade, join(stage, "tooling/src")), join(facade, "src"), "dir");
  }
  for (const { path } of workspaces) {
    const moduleRoot = join(stage, dirname(path), "node_modules");
    mkdirSync(moduleRoot, { recursive: true });
    for (const workspace of workspaces.filter((row) => row.path !== "package.json")) {
      const link = join(moduleRoot, workspace.name);
      if (existsSync(link)) {
        continue;
      }
      const target = workspace.path === "tooling/package.json" ? join(stage, "node_modules", workspace.name) : join(stage, dirname(workspace.path));
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(relative(dirname(link), target), link, "dir");
    }
    linkInstalledModules(join(root, dirname(path), "node_modules"), moduleRoot);
  }
}

function applicationConfig(root: string, configured: ReturnType<typeof ordinaryConfig>, population: ApplicationSubjects): ReturnType<typeof ordinaryConfig> {
  const plugins = applicationKnipPluginNames(root);
  const disabled = Object.fromEntries(plugins.map((name) => [name, false]));
  const workspaces = Object.fromEntries(
    Object.entries(configured.workspaces ?? {}).map(([workspace, config]) => {
      if (workspace !== "." && workspace !== "tooling") {
        return [workspace, config] as const;
      }
      const belongs = (path: string): boolean =>
        workspace === "." ? !(path.startsWith("packages/") || path.startsWith("tooling/")) : path.startsWith("tooling/");
      const local = (path: string): string => (workspace === "." ? path : path.slice("tooling/".length));
      return [
        workspace,
        {
          ...config,
          ...disabled,
          entry: population.roots.filter(belongs).map(local),
          project: population.inventory.paths.filter(belongs).map(local),
          ...(workspace === "."
            ? {
                vitest: { config: [APPLICATION_TEST_CONFIGS.node] },
                playwright: { config: [APPLICATION_TEST_CONFIGS.ct, APPLICATION_TEST_CONFIGS.e2e] },
              }
            : {}),
        },
      ] as const;
    }),
  );
  // Selector/config self-liveness is weekly; invalid native configuration still refuses in Knip itself.
  return { ...configured, treatConfigHintsAsErrors: false, workspaces };
}

/** The existing native-config transaction owns all source bytes and cleanup; only discovery metadata changes. */
export function materializeApplicationKnipView(
  root: string,
  population: ApplicationSubjects,
  configured: ReturnType<typeof ordinaryConfig>,
): ConfigSnapshotTransaction {
  const overlay = Object.fromEntries(
    ["package.json", "tooling/package.json"].filter((path) => existsSync(join(root, path))).map((path) => [path, projectManifest(root, path, population)]),
  );
  const view = materializeConfigSnapshotTransaction({ root, overlay });
  try {
    preserveWorkspaceResolution(root, view.root);
    writeFileSync(join(view.root, CONFIG), `${JSON.stringify(applicationConfig(root, configured, population))}\n`);
    return view;
  } catch (error) {
    view.cleanup();
    throw error;
  }
}

/** Execute both native issue populations over one pre-analysis view; native findings are never filtered. */
export function runApplicationKnip(
  root: string,
  population: ApplicationSubjects,
  production = false,
  configured = ordinaryConfig({ production, strict: production }),
): number {
  const view = materializeApplicationKnipView(root, population, configured);
  try {
    const workspaces = [
      ...new Set(
        population.files.flatMap((path) => {
          const workspace = /^(packages\/[^/]+)\//u.exec(path)?.[1];
          return workspace === undefined ? [] : [workspace];
        }),
      ),
    ].toSorted();
    if (workspaces.length === 0) {
      throw new Error("application Knip has no native package subjects");
    }
    const run = (args: readonly string[]): number =>
      asViolations(runNicedSync(join(root, "node_modules/.bin/knip"), ["--config", CONFIG, ...args], { cwd: view.root, stdio: "inherit" }).status);
    const packages = run([...workspaces.flatMap((workspace) => ["--workspace", workspace]), ...(production ? ["--production", "--strict"] : [])]);
    const composition = run([
      "--workspace",
      ".",
      ...(existsSync(join(view.root, "tooling/package.json")) ? ["--workspace", "tooling"] : []),
      "--include",
      "unlisted,unresolved,binaries",
    ]);
    process.stdout.write(`application native Knip: ${workspaces.join(", ")}; composition imports/binaries; production=${String(production)}\n`);
    return aggregateExit([packages, composition]);
  } finally {
    view.cleanup();
  }
}
