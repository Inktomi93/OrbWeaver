// The planted native-inventory fixtures and span helpers the semantic-inventory extraction suites share.
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventoryBuildRequest, InventorySpan } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Node } from "ts-morph";
import { DocumentSpan, LanguageService, Project, ts } from "ts-morph";
import { vi } from "vitest";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";

export function nativeInputCase(mode: string, implementation: string, root: string): string {
  const result = join(root, ".cache/native-input-currentness-result.json");
  mkdirSync(dirname(result), { recursive: true });
  const entry = fileURLToPath(new URL("./native-input-currentness-cases.ts", import.meta.url));
  const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
  const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, mode, implementation, root, result], {
    timeout: scaledBudget(180_000),
  });
  expect(completed.errorCode).toBeUndefined();
  expect(completed.status, completed.stderr).toBe(0);
  return readFileSync(result, "utf8");
}

export const implementationRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export function span(node: Node): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

export function fixtureValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("required native query fixture value missing");
  }
  return value;
}

export function redirectFixture(root: string, variant: "identical" | "different" | "symlink"): InventoryBuildRequest {
  const write = (path: string, text: string): void => {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  };
  write(".gitignore", "node_modules/\n.cache/\n");
  write(
    "tsconfig.json",
    JSON.stringify({
      files: ["consumer.ts"],
      compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler", preserveSymlinks: variant === "symlink" },
    }),
  );
  for (const side of ["left", "right", "other"]) {
    write(`node_modules/${side}/package.json`, JSON.stringify({ name: side, version: "1.0.0", types: "index.d.ts" }));
    write(`node_modules/${side}/index.d.ts`, "export {value as value, inner} from 'shared';\n");
    const shared = `node_modules/${side}/node_modules/shared`;
    write(`${shared}/package.json`, JSON.stringify({ name: "shared", version: side === "other" ? "2.0.0" : "1.0.0", types: "index.d.ts" }));
    write(
      `${shared}/index.d.ts`,
      `${variant === "different" && side === "right" ? "export declare const unrelated: string;\n" : ""}export declare const value: ${side === "other" ? "2" : "1"}; export {inner} from './inner';\n`,
    );
    write(`${shared}/inner.d.ts`, "export declare const inner: number;\n");
  }
  if (variant === "symlink") {
    symlinkSync("left/node_modules/shared", join(root, "node_modules/linked"));
  }
  write(
    "consumer.ts",
    [
      "import {value as left} from 'left'; import {value as right} from 'right'; import {value as other} from 'other';",
      "import {absent} from './absent'; export const missing=absent;",
      "export const use=left+right+other; export const witness='value' satisfies keyof typeof import('right');",
      variant === "symlink" ? "import {inner} from 'linked'; export const linked=inner;" : "",
    ].join("\n"),
  );
  execFixtureGit(root, ["init", "-q"]);
  return { root, descriptor: fixtureValue(readCompilerPrograms(root)[0]), destination: join(root, "unused.sqlite") };
}

export function extractWithoutReferenceWrappers(
  request: InventoryBuildRequest,
  beforeQuery?: (service: ts.LanguageService) => void,
  observePass?: (pass: ts.ReadonlyReferencePass) => void,
): { partition: ReturnType<typeof extractInventoryPartition>; queries: string[]; fallbackQueries: string[] } {
  const queries: string[] = [];
  const fallbackQueries: string[] = [];
  let computedOccurrenceAnswers = 0;
  const restoreQueries: (() => void)[] = [];
  const observed = new Set<LanguageService>();
  const getLanguageService = Project.prototype.getLanguageService;
  const observation = vi.spyOn(Project.prototype, "getLanguageService").mockImplementation(function (this: Project) {
    const service = getLanguageService.call(this);
    if (!observed.has(service)) {
      observed.add(service);
      const createPass = service.compilerObject.createReadonlyReferencePass.bind(service.compilerObject);
      const passCreation = vi.spyOn(service.compilerObject, "createReadonlyReferencePass").mockImplementation(() => {
        const pass = createPass();
        observePass?.(pass);
        const nativeOccurrences = typeof pass.findReferencesFromOccurrences === "function" ? pass.findReferencesFromOccurrences.bind(pass) : undefined;
        if (nativeOccurrences !== undefined) {
          const occurrences = vi.spyOn(pass, "findReferencesFromOccurrences").mockImplementation((requests) => {
            beforeQuery?.(service.compilerObject);
            queries.push(...requests.map(({ fileName, position }) => JSON.stringify([fileName, position])));
            const answers = nativeOccurrences(requests);
            computedOccurrenceAnswers += answers.filter((answer) => answer.kind !== "native").length;
            return answers;
          });
          restoreQueries.push(() => occurrences.mockRestore());
        }
        const nativeFind = pass.findReferences.bind(pass);
        const query = vi.spyOn(pass, "findReferences").mockImplementation((file, position, options) => {
          expect(options).toEqual({ includeDefinitionDisplay: false });
          beforeQuery?.(service.compilerObject);
          const key = JSON.stringify([file, position]);
          fallbackQueries.push(key);
          if (nativeOccurrences === undefined) {
            queries.push(key);
          }
          return nativeFind(file, position, options);
        });
        restoreQueries.push(() => query.mockRestore());
        return pass;
      });
      restoreQueries.push(() => passCreation.mockRestore());
    }
    return service;
  });
  const wrappers = vi.spyOn(LanguageService.prototype, "findReferences").mockImplementation(() => {
    throw new Error("reference wrappers retain source-file modification subscriptions");
  });
  const materialization = vi.spyOn(DocumentSpan.prototype, "getNode").mockImplementation(() => {
    throw new Error("reference spans must not materialize DocumentSpan nodes");
  });
  try {
    const partition = extractInventoryPartition({ ...request, referenceDemand: { mode: "complete", queries: [] } });
    const demand = new Set(queries);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.length).toBe(demand.size);
    expect(fallbackQueries.length).toBe(new Set(fallbackQueries).size);
    expect(fallbackQueries.every((query) => demand.has(query))).toBe(true);
    expect(computedOccurrenceAnswers + fallbackQueries.length).toBeGreaterThan(0);
    expect(wrappers).not.toHaveBeenCalled();
    expect(materialization).not.toHaveBeenCalled();
    return { partition, queries, fallbackQueries };
  } finally {
    materialization.mockRestore();
    wrappers.mockRestore();
    for (const restore of restoreQueries) {
      restore();
    }
    observation.mockRestore();
  }
}

export function nativeReferenceFixture(mode: ts.LanguageServiceMode = ts.LanguageServiceMode.Semantic): {
  service: ts.LanguageService;
  cancel: (value: boolean) => void;
  update: (file: string, text: string) => void;
  reverseRoots: () => void;
  strict: () => void;
} {
  const files = new Map([
    ["/base.ts", "export const first=1; export const second=2;\n"],
    ["/consumer.ts", "import {first,second} from './base'; export const use=first+second;\n"],
    ["/unrelated-base.ts", "export const untouched=3;\n"],
    ["/unrelated.ts", "import {untouched} from './unrelated-base'; export const other=untouched;\n"],
  ]);
  let version = 0;
  let cancelled = false;
  let reversed = false;
  let options: ts.CompilerOptions = { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "/lib.d.ts",
    getProjectVersion: () => String(version),
    getScriptFileNames: () => (reversed ? [...files.keys()].toReversed() : [...files.keys()]),
    getScriptVersion: () => String(version),
    getScriptSnapshot: (file) => {
      const text = files.get(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    readFile: (file) => files.get(file),
    fileExists: (file) => files.has(file),
    getCancellationToken: () => ({ isCancellationRequested: () => cancelled }),
  };
  return {
    service: ts.createLanguageService(host, undefined, mode),
    cancel: (value): void => {
      cancelled = value;
    },
    update: (file, text): void => {
      files.set(file, text);
      version++;
    },
    reverseRoots: (): void => {
      reversed = !reversed;
      version++;
    },
    strict: (): void => {
      options = { ...options, strict: true };
      version++;
    },
  };
}
