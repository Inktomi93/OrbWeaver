// Conservative affected-instrument import reach includes type-only edges and quoted policy-family witnesses.
// Native tooling configuration owns resolution; unreadable inputs throw rather than shrinking the graph.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";

import { dirname, join, relative as relativePath, sep } from "node:path";
import { isWithinRoot } from "@orb/kit/path-containment";
import { ts } from "ts-morph";
import { classifyTestFilename, runtimeForTestFamily } from "../testing/test-kinds.ts";
import { moduleClosure } from "./module-reach.ts";
import type { InstrumentAffectedPolicyReach } from "./module-reach-contract.ts";

const GATE_TESTS_DIR = "tests/tooling/verify/gates";
const SPEC_SUFFIX = ".ts";
const IMPORT_GRAPH_ROOTS = ["tooling/src", "tests", "scripts"] as const;
const TOOLING_TESTS_PREFIX = "tests/tooling/";
const SOURCE_SUFFIXES = [".ts", ".tsx"] as const;
const TOOLING_TSCONFIG = "tooling/tsconfig.json";
const GATES_PREFIX = "tooling/src/verify/gates/";
const TYPESCRIPT_SUFFIX = ".ts";

/** Every spec under the gate-tests directory, repo-relative, recursively. An ABSENT directory (a synthetic
 *  fixture root) yields none — the caller's empty-specs arm is what reports a policy with no proofs. */
function gateSpecs(root: string, relative: string = GATE_TESTS_DIR): readonly string[] {
  if (!existsSync(join(root, relative))) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...gateSpecs(root, child));
    } else if (entry.name.endsWith(SPEC_SUFFIX)) {
      out.push(child);
    }
  }
  return out;
}

/** The specs whose text names `policyId` as a quoted string — the family test wherever it actually lives. */
export function toolingTestsNaming(root: string, policyId: string): readonly string[] {
  const needle = JSON.stringify(policyId);
  return gateSpecs(root).filter((rel) => readFileSync(join(root, rel), "utf8").includes(needle));
}

/** Every TypeScript module in the bounded instrument/test graph. Directory entries are the authority:
 *  a read failure throws instead of shrinking the graph to a false clean. */
function graphModules(root: string, relative: string): readonly string[] {
  const absolute = join(root, relative);
  if (!existsSync(absolute)) {
    return [];
  }
  const modules: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      modules.push(...graphModules(root, child));
    } else if (SOURCE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      modules.push(child);
    }
  }
  return modules;
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function compilerOptions(root: string): ts.CompilerOptions {
  const config = join(root, TOOLING_TSCONFIG);
  const read = ts.readConfigFile(config, ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(`instrument import reach could not read ${TOOLING_TSCONFIG}: ${diagnosticText(read.error)}`);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(config), undefined, config);
  if (parsed.errors.length > 0) {
    throw new Error(`instrument import reach could not parse ${TOOLING_TSCONFIG}: ${parsed.errors.map(diagnosticText).join("\n")}`);
  }
  return parsed.options;
}

function repoPath(canonicalRoot: string, absolute: string): string | undefined {
  const canonical = realpathSync(absolute);
  if (!isWithinRoot(canonicalRoot, canonical, { sep })) {
    return;
  }
  return relativePath(canonicalRoot, canonical).split(sep).join("/");
}

function moduleResolver(root: string): (importer: string, specifier: string) => string | undefined {
  const options = compilerOptions(root);
  const canonicalRoot = realpathSync(root);
  const cache = ts.createModuleResolutionCache(root, (path) => path, options);
  return (importer, specifier) => {
    const resolved = ts.resolveModuleName(specifier, join(root, importer), options, ts.sys, cache).resolvedModule?.resolvedFileName;
    return resolved === undefined ? undefined : repoPath(canonicalRoot, resolved);
  };
}

/** Every repository module the entries reach through native tooling resolution, type-only edges included. */
export function toolingModuleClosure(root: string, entries: readonly string[]): readonly string[] {
  const resolveModule = moduleResolver(root);
  const targetsOf = (importer: string): readonly string[] =>
    ts.preProcessFile(readFileSync(join(root, importer), "utf8"), true, true).importedFiles.flatMap(({ fileName }) => {
      const target = resolveModule(importer, fileName);
      return target === undefined || target.split("/").includes("node_modules") ? [] : [target];
    });
  return [...moduleClosure(entries, targetsOf)].toSorted();
}

export function isRunnableToolingSpec(path: string): boolean {
  if (!path.startsWith(TOOLING_TESTS_PREFIX)) {
    return false;
  }
  const testKind = classifyTestFilename(path);
  return testKind !== undefined && runtimeForTestFamily(testKind.definition.family) === "vitest";
}

function reverseImportGraph(root: string, modules: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const moduleSet = new Set(modules);
  const importers = new Map<string, string[]>();
  const resolveModule = moduleResolver(root);
  for (const importer of modules) {
    const preprocessed = ts.preProcessFile(readFileSync(join(root, importer), "utf8"), true, true);
    for (const imported of preprocessed.importedFiles) {
      const target = resolveModule(importer, imported.fileName);
      if (target === undefined || !moduleSet.has(target)) {
        continue;
      }
      const existing = importers.get(target);
      if (existing === undefined) {
        importers.set(target, [importer]);
      } else {
        existing.push(importer);
      }
    }
  }
  return importers;
}

function importingSpecs(source: string, importers: ReadonlyMap<string, readonly string[]>): readonly string[] {
  return [...moduleClosure(importers.get(source) ?? [], (path) => importers.get(path) ?? [])].filter(isRunnableToolingSpec).toSorted();
}

function basenamePolicyId(path: string): string | undefined {
  if (!(path.startsWith(GATES_PREFIX) && path.endsWith(TYPESCRIPT_SUFFIX))) {
    return;
  }
  const id = path.slice(GATES_PREFIX.length, -TYPESCRIPT_SUFFIX.length);
  return id.includes("/") ? undefined : id;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function policyIdFromCall(call: ts.CallExpression): string | undefined {
  const argument = call.arguments[0] === undefined ? undefined : unwrapExpression(call.arguments[0]);
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) {
    return;
  }
  const property = argument.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      ((ts.isIdentifier(candidate.name) && candidate.name.text === "id") || (ts.isStringLiteral(candidate.name) && candidate.name.text === "id")),
  );
  const value = property === undefined ? undefined : unwrapExpression(property.initializer);
  return value !== undefined && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) ? value.text : undefined;
}

/** The literal descriptor ID authored by `export const gate = defineGate({ id: "…" })`. Any other shape
 * is deliberately unreadable here: the runtime loader gives the precise refusal, while affected selection
 * keeps the full roster rather than trusting a filename that may not name the actual policy. */
function authoredPolicyId(root: string, path: string): string | undefined {
  const source = ts.createSourceFile(path, readFileSync(join(root, path), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statement = source.statements.find(
    (candidate): candidate is ts.VariableStatement =>
      ts.isVariableStatement(candidate) && candidate.declarationList.declarations.some((entry) => ts.isIdentifier(entry.name) && entry.name.text === "gate"),
  );
  if (statement === undefined) {
    return;
  }
  const declaration = statement.declarationList.declarations.find((candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === "gate");
  const initializer = declaration?.initializer === undefined ? undefined : unwrapExpression(declaration.initializer);
  if (initializer === undefined || !ts.isCallExpression(initializer)) {
    return;
  }
  const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
  const callee = unwrapExpression(initializer.expression);
  if (!(exported && ts.isIdentifier(callee)) || callee.text !== "defineGate") {
    return;
  }
  return policyIdFromCall(initializer);
}

function importingPolicies(source: string, importers: ReadonlyMap<string, readonly string[]>, root: string): InstrumentAffectedPolicyReach {
  const reachedPolicies = new Set<string>();
  const unclassifiableGatePaths = new Set<string>();
  for (const current of moduleClosure([source], (path) => importers.get(path) ?? [])) {
    const basenameId = basenamePolicyId(current);
    if (basenameId !== undefined) {
      const authoredId = authoredPolicyId(root, current);
      if (authoredId === basenameId) {
        reachedPolicies.add(authoredId);
      } else {
        unclassifiableGatePaths.add(current);
      }
    }
  }
  return { policyIds: [...reachedPolicies].toSorted(), unclassifiableGatePaths: [...unclassifiableGatePaths].toSorted() };
}

/** Specs and policies that transitively import each source, derived from ONE graph construction. Literal
 *  static imports, re-exports and literal `import()` calls come from TypeScript's fast preprocessor.
 *  Type-only edges deliberately over-select: running an extra spec/policy is safe, while trying to infer
 *  runtime use here can silently miss a test. A computed dynamic target has no provable file identity and
 *  credits nothing, leaving the source unreached unless another proof door reaches it.
 *
 *  The tuple keeps the two maps on one parse/resolution pass. Building a second TypeScript graph just to
 *  derive policy reach would add compiler startup to the stage whose job is to remove verification cost. */
export function toolingImportReach(
  root: string,
  sources: readonly string[],
): readonly [ReadonlyMap<string, readonly string[]>, ReadonlyMap<string, InstrumentAffectedPolicyReach>] {
  const modules = IMPORT_GRAPH_ROOTS.flatMap((relative) => graphModules(root, relative)).toSorted();
  const importers = reverseImportGraph(root, modules);
  return [
    new Map(sources.map((source) => [source, importingSpecs(source, importers)])),
    new Map(sources.map((source) => [source, importingPolicies(source, importers, root)])),
  ];
}
