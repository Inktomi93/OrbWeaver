import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { createWorkspaceResolutionCache } from "@orb/tooling/_shared/ts-workspace-resolution";
import type { Project, ResolutionHost } from "ts-morph";
import { ts } from "ts-morph";
import { expect, test } from "../../support/tool-fixtures.ts";

function resolveThroughCompiler(host: ResolutionHost, name: string, importer: string, options: ts.CompilerOptions): string | undefined {
  const compilerOptions = { ...options, noLib: true, types: [] };
  const compilerHost = ts.createCompilerHost(compilerOptions);
  Object.assign(compilerHost, host);
  compilerHost.getSourceFile = (path, target): ts.SourceFile =>
    ts.createSourceFile(path, path === importer ? `import ${JSON.stringify(name)};` : "export {};", target);
  const program = ts.createProgram([importer], compilerOptions, compilerHost);
  return program.getSourceFiles().find((file) => file.fileName !== importer)?.fileName;
}

test("module lookup reuse avoids filesystem probes and invalidates failed lookups and changed options", ({ scratch }) => {
  const available = new Set<string>();
  let probes = 0;
  const options: ts.CompilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler };
  const cache = createWorkspaceResolutionCache();
  const host = cache.host(
    {
      fileExists: (path) => {
        probes++;
        return available.has(path);
      },
      readFile: () => undefined,
      directoryExists: (path) => !path.endsWith("/missing"),
    },
    () => options,
  );
  const importer = join(scratch, "importer.ts");
  const resolveName = (name: string, compilerOptions = options): string | undefined => resolveThroughCompiler(host, name, importer, compilerOptions);
  const target = join(scratch, "target.ts");
  available.add(target);
  expect(resolveName("./target")).toBe(target);
  const initial = probes;
  expect(initial).toBeGreaterThan(0);
  expect(resolveName("./target", { ...options })).toBe(target);
  expect(probes).toBe(initial);
  expect(resolveThroughCompiler(host, "./target", join(scratch, "sibling.ts"), options)).toBe(target);
  expect(probes).toBe(initial);
  cache.invalidate([join(scratch, "unrelated.ts")]);
  expect(resolveName("./target")).toBe(target);
  expect(probes).toBe(initial);

  available.delete(target);
  cache.invalidate([target]);
  expect(resolveName("./target")).toBeUndefined();
  available.add(target);
  expect(resolveName("./target")).toBeUndefined();
  cache.invalidate([target]);
  expect(resolveName("./target")).toBe(target);
  const beforeOptions = probes;
  expect(resolveName("./target", { ...options, allowJs: true })).toBe(target);
  expect(probes).toBeGreaterThan(beforeOptions);
});

test("a failed directory probe recovers when an overlay creates its first module", ({ scratch }) => {
  const present = new Set<string>();
  const target = join(scratch, "missing", "index.ts");
  const options: ts.CompilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler };
  const cache = createWorkspaceResolutionCache();
  const host = cache.host(
    {
      fileExists: (path) => present.has(target) && path === target,
      readFile: () => undefined,
      directoryExists: (path) => present.has(target) || !path.endsWith("/missing"),
    },
    () => options,
  );
  const resolveName = (): string | undefined => resolveThroughCompiler(host, "./missing", join(scratch, "importer.ts"), options);
  expect(resolveName()).toBeUndefined();
  present.add(target);
  expect(resolveName()).toBeUndefined();
  cache.invalidate([target]);
  expect(resolveName()).toBe(target);
});

test("conditional exports keep import and require resolution modes distinct for one importer", ({ scratch }) => {
  const importer = join(scratch, "importer.ts");
  const packageRoot = join(scratch, "node_modules/dual");
  const files = new Map([
    [join(packageRoot, "package.json"), JSON.stringify({ name: "dual", exports: { import: "./import.d.ts", require: "./require.d.ts" } })],
    [join(packageRoot, "import.d.ts"), 'export type Value = "import";'],
    [join(packageRoot, "require.d.ts"), 'export type Value = "require";'],
  ]);
  const options: ts.CompilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noLib: true, types: [] };
  const cache = createWorkspaceResolutionCache();
  const host = cache.host({ fileExists: (path) => files.has(path), readFile: (path) => files.get(path), directoryExists: () => true }, () => options);
  const resolved = (mode: "import" | "require"): readonly string[] => {
    const source = `import type { Value } from "dual" with { "resolution-mode": "${mode}" }; export type Result = Value;`;
    const compilerHost = ts.createCompilerHost(options);
    Object.assign(compilerHost, host);
    compilerHost.getSourceFile = (path, target): ts.SourceFile => ts.createSourceFile(path, path === importer ? source : (files.get(path) ?? ""), target);
    const program = ts.createProgram([importer], options, compilerHost);
    return program.getSourceFiles().map((file) => file.fileName);
  };
  expect(resolved("import")).toContain(join(packageRoot, "import.d.ts"));
  expect(resolved("require")).toContain(join(packageRoot, "require.d.ts"));
  expect(resolved("import")).not.toContain(join(packageRoot, "require.d.ts"));
});

test("an ambient import omitted from resolution cannot shift the following conditional import's mode", ({ scratch }) => {
  const importer = join(scratch, "ambient.d.ts");
  const packageRoot = join(scratch, "node_modules/dual");
  const files = new Map([
    [
      importer,
      'declare module "local" { export type X = 1; }\ndeclare module "consumer" { import type { X } from "local" with { "resolution-mode": "import" }; import type { Value } from "dual" with { "resolution-mode": "require" }; export type Result = [X, Value]; }',
    ],
    [join(packageRoot, "package.json"), JSON.stringify({ name: "dual", exports: { import: "./import.d.ts", require: "./require.d.ts" } })],
    [join(packageRoot, "import.d.ts"), 'export type Value = "import";'],
    [join(packageRoot, "require.d.ts"), 'export type Value = "require";'],
  ]);
  const options: ts.CompilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noLib: true, types: [] };
  const sources = (cached: boolean): readonly string[] => {
    const host = ts.createCompilerHost(options);
    host.fileExists = (path): boolean => files.has(path);
    host.readFile = (path): string | undefined => files.get(path);
    host.directoryExists = (): boolean => true;
    host.getSourceFile = (path, target): ts.SourceFile | undefined => {
      const text = files.get(path);
      return text === undefined ? undefined : ts.createSourceFile(path, text, target, true);
    };
    if (cached) {
      Object.assign(
        host,
        createWorkspaceResolutionCache().host(host, () => options),
      );
    }
    return ts
      .createProgram([importer], options, host)
      .getSourceFiles()
      .map((file) => file.fileName);
  };
  const fresh = sources(false);
  expect(fresh).toContain(join(packageRoot, "require.d.ts"));
  expect(fresh).not.toContain(join(packageRoot, "import.d.ts"));
  expect(sources(true)).toEqual(fresh);
});

test("partially reused imports preserve different modes for the same module specifier", ({ scratch }) => {
  const importer = join(scratch, "ambient.d.ts");
  const addedRoot = join(scratch, "added.ts");
  const packageRoot = join(scratch, "node_modules/dual");
  const required = join(packageRoot, "require.d.ts");
  const files = new Map([
    [
      importer,
      'declare module "local" { export type X = 1; }\ndeclare module "consumer" { import type { X } from "local"; import type { Value as I } from "dual" with { "resolution-mode": "import" }; import type { Value as R } from "dual" with { "resolution-mode": "require" }; export type Result = [X, I, R]; }',
    ],
    [join(packageRoot, "package.json"), JSON.stringify({ name: "dual", exports: { import: "./import.d.ts", require: "./require.d.ts" } })],
    [join(packageRoot, "import.d.ts"), 'export type Value = "import";'],
  ]);
  const options: ts.CompilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noLib: true, types: [] };
  const host = ts.createCompilerHost(options);
  const sourceFiles = new Map<string, ts.SourceFile>();
  host.fileExists = (path): boolean => files.has(path);
  host.readFile = (path): string | undefined => files.get(path);
  host.directoryExists = (): boolean => true;
  host.getSourceFile = (path, target): ts.SourceFile | undefined => {
    const text = files.get(path);
    if (text === undefined) {
      return;
    }
    const source = sourceFiles.get(path) ?? ts.createSourceFile(path, text, target, true);
    sourceFiles.set(path, source);
    return source;
  };
  const cache = createWorkspaceResolutionCache();
  const { resolveModuleNameLiterals } = cache.host(host, () => options);
  if (resolveModuleNameLiterals === undefined) {
    throw new Error("the cache must supply the native literal-resolution hook");
  }
  const requests: { readonly modes: readonly ts.ResolutionMode[]; readonly reused: readonly string[] }[] = [];
  const cachedHost: ts.CompilerHost = {
    ...host,
    resolveModuleNameLiterals: (...args) => {
      requests.push({
        modes: args[0].map((literal) => ts.getModeForUsageLocation(args[4], literal, args[3])),
        reused: args[5]?.map((literal) => literal.text) ?? [],
      });
      return resolveModuleNameLiterals(...args);
    },
  };
  const initial = ts.createProgram([importer], options, cachedHost);
  expect(initial.getSourceFiles().map((file) => file.fileName)).not.toContain(required);
  expect(requests).toEqual([{ modes: [ts.ModuleKind.ESNext, ts.ModuleKind.CommonJS], reused: [] }]);
  requests.length = 0;
  files.set(required, 'export type Value = "require";');
  files.set(addedRoot, "export {};");
  cache.invalidate([required, addedRoot]);
  const updated = ts.createProgram([importer, addedRoot], options, cachedHost, initial);
  const fresh = ts.createProgram([importer, addedRoot], options, host);
  expect(requests).toEqual([{ modes: [ts.ModuleKind.CommonJS], reused: ["dual"] }]);
  expect(updated.getSourceFiles().map((file) => file.fileName)).toEqual(fresh.getSourceFiles().map((file) => file.fileName));
  expect(updated.getSourceFiles().map((file) => file.fileName)).toContain(required);
});

test("ts-morph forwards actual import literals through both compiler and language-service hosts", ({ scratch }) => {
  const importer = "packages/kit/src/ambient.d.ts";
  const files = {
    [importer]:
      'declare module "local" { export type X = 1; }\ndeclare module "consumer" { import type { X } from "local" with { "resolution-mode": "import" }; import type { Value } from "dual" with { "resolution-mode": "require" }; export type Result = [X, Value]; }',
    "node_modules/dual/package.json": JSON.stringify({ name: "dual", exports: { import: "./import.d.ts", require: "./require.d.ts" } }),
    "node_modules/dual/import.d.ts": 'export type Value = "import";',
    "node_modules/dual/require.d.ts": 'export type Value = "require";',
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const modes: ts.ResolutionMode[] = [];
  const cache = createWorkspaceResolutionCache();
  const project = getWorkspace({
    root: scratch,
    resolutionHost: (host, getOptions) => {
      const { resolveModuleNameLiterals } = cache.host(host, getOptions);
      if (resolveModuleNameLiterals === undefined) {
        throw new Error("the cache must supply the native literal-resolution hook");
      }
      return {
        resolveModuleNameLiterals: (...args) => {
          modes.push(...args[0].map((literal) => ts.getModeForUsageLocation(args[4], literal, args[3])));
          return resolveModuleNameLiterals(...args);
        },
      };
    },
  });
  const options: ts.CompilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noLib: true, types: [] };
  project.compilerOptions.set(options);
  const expected = join(scratch, "node_modules/dual/require.d.ts");
  expect(
    project
      .getProgram()
      .compilerObject.getSourceFiles()
      .map((file) => file.fileName),
  ).toContain(expected);
  expect(modes).toEqual([ts.ModuleKind.CommonJS]);
  modes.length = 0;
  expect(
    project
      .getLanguageService()
      .compilerObject.getProgram()
      ?.getSourceFiles()
      .map((file) => file.fileName),
  ).toContain(expected);
  expect(modes).toEqual([ts.ModuleKind.CommonJS]);

  const defaultProject = getWorkspace({ root: scratch });
  defaultProject.compilerOptions.set(options);
  expect(
    defaultProject
      .getProgram()
      .compilerObject.getSourceFiles()
      .map((file) => file.fileName),
  ).toContain(expected);
  expect(
    defaultProject
      .getLanguageService()
      .compilerObject.getProgram()
      ?.getSourceFiles()
      .map((file) => file.fileName),
  ).toContain(expected);
});

function replace(project: Project, path: string, text: string | undefined): void {
  const old = project.getSourceFile(path);
  if (old !== undefined) {
    project.removeSourceFile(old);
  }
  if (text !== undefined) {
    project.createSourceFile(path, text, { overwrite: true });
  }
  project.getLanguageService().compilerObject.cleanupSemanticCache();
}

interface Observation {
  readonly value: string;
  readonly global: string;
  readonly errors: readonly number[];
  readonly population: readonly string[];
  readonly references: readonly string[];
}

function observe(project: Project, root: string): Observation {
  const importer = project.getSourceFileOrThrow(join(root, "packages/kit/src/importer.ts"));
  const value = importer.getVariableDeclarationOrThrow("value").getType().getText();
  const global = importer.getVariableDeclarationOrThrow("globalValue").getType().getText();
  const errors = importer
    .getPreEmitDiagnostics()
    .map((diagnostic) => diagnostic.getCode())
    .toSorted();
  return {
    value,
    global,
    errors,
    references: project
      .getSourceFileOrThrow(join(root, "packages/kit/src/exporter.ts"))
      .getVariableDeclarationOrThrow("exported")
      .findReferencesAsNodes()
      .map((node) => `${relative(root, node.getSourceFile().getFilePath())}:${String(node.getStart())}`)
      .toSorted(),
    population: project
      .getSourceFiles()
      .map((file) => relative(root, file.getFilePath()))
      .toSorted(),
  };
}

test("cached rebuilds equal fresh solo programs across changed exports, globals, disk twins and resolution recovery", ({ scratch }) => {
  const base = {
    "packages/kit/src/importer.ts": 'import { exported } from "./exporter"; export const value = exported; export const globalValue = ambient;\n',
    "packages/kit/src/exporter.ts": 'export const exported = "baseline" as const;\n',
    "packages/kit/src/globals.d.ts": 'declare const ambient: "baseline-global";\n',
  };
  for (const [path, text] of Object.entries(base)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const cache = createWorkspaceResolutionCache();
  const reused = getWorkspace({ root: scratch, resolutionHost: cache.host });
  const baseline = observe(reused, scratch);
  expect(baseline.value).toBe('"baseline"');
  expect(baseline.global).toBe('"baseline-global"');
  expect(baseline.references).toHaveLength(2);
  const interventions: readonly Readonly<Record<string, string | undefined>>[] = [
    { "packages/kit/src/exporter.ts": "export const exported = 42 as const;\n" },
    { "packages/kit/src/globals.d.ts": "declare const ambient: 77;\n" },
    { "packages/kit/src/exporter.ts": undefined },
    { "packages/kit/src/importer.ts": 'import { exported } from "./missing"; export const value = exported; export const globalValue = ambient;\n' },
    {
      "packages/kit/src/importer.ts": 'import { exported } from "./missing"; export const value = exported; export const globalValue = ambient;\n',
      "packages/kit/src/missing.ts": 'export const exported = "recovered" as const;\n',
    },
    { "packages/kit/src/importer.ts": 'export const value = "no-import" as const; export const globalValue = ambient;\n' },
  ];
  const observations: Observation[] = [];
  for (const intervention of interventions) {
    const fresh = getWorkspace({ root: scratch });
    const paths = Object.keys(intervention).map((path) => join(scratch, path));
    cache.invalidate(paths);
    for (const [path, text] of Object.entries(intervention)) {
      replace(reused, join(scratch, path), text);
      replace(fresh, join(scratch, path), text);
    }
    const result = observe(reused, scratch);
    expect(result).toEqual(observe(fresh, scratch));
    observations.push(result);
    cache.invalidate(paths);
    for (const path of Object.keys(intervention)) {
      replace(reused, join(scratch, path), Object.entries(base).find(([key]) => key === path)?.[1]);
    }
    expect(observe(reused, scratch), JSON.stringify(intervention)).toEqual(baseline);
  }
  expect(observations.map((result) => result.value)).toEqual(["42", '"baseline"', '"baseline"', "any", '"recovered"', '"no-import"']);
  expect(observations[1]?.global).toBe("77");
  expect(observations[3]?.errors).toContain(2307);
  expect(observations[4]?.errors).not.toContain(2307);
  expect(observations[5]?.references).toEqual([]);
});
