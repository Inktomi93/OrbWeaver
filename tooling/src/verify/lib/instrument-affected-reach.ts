// THE AFFECTED-INSTRUMENT REACH: which specs depend on a tooling source through imports, plus the gate-ID
// family reach whose proof file intentionally need not import every policy in its wave.
//
// WHY A TEXT SEARCH AND NOT THE MIRROR. A converted policy's family test routinely lives under its WAVE's
// name rather than its gate's — `contract-shape-wave-1.test.ts`, `simple-visitors-wave-2.test.ts`,
// `callback-provenance-family.suite.test.ts` — so `tooling/src/verify/gates/<id>.ts` prefix-swaps to a
// path that does not exist while the policy's §4.2/§4.5 proofs sit one directory over. That is not an
// accident to be fixed by renaming: a family's proofs belong in ONE file, which by construction cannot be
// named after each of its members. `.claude/rules/verify-and-gates.md` already states the rule for
// humans ("find a gate's family test by grepping its id"); this is that rule with a machine behind it.
//
// THE SEARCH IS DELIBERATELY DUMB — a quoted-ID substring over the spec's own text. It over-selects (a
// spec that merely MENTIONS a policy in a comment is selected) and that direction is the safe one: the
// cost is running a spec that did not need running, and the alternative direction is the silent miss this
// whole stage exists to remove. It cannot under-select through an alias or an import rewrite, because a
// proof row, a `policy:` pin and an ID assertion all spell the ID literally.
// NO try/catch ANYWHERE IN THIS MODULE, deliberately. Absence is ASKED (`existsSync`), never caught: a
// `catch` here would be an unproven caught-failure site (`caught-failure-ownership`) AND would turn an
// unreadable tests tree — a real tool error — into a quiet empty reach, which is the bare-zero shape this
// whole stage exists to remove. Every read below is of a path the directory listing produced moments
// earlier, so a failure is a genuine I/O fault and belongs as a throw the stage reports as exit 2.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative as relativePath, sep } from "node:path";
import { ts } from "ts-morph";
import { classifyTestFilename, runtimeForTestFamily } from "../../_shared/test-kinds.ts";
import type { InstrumentAffectedPolicyReach } from "../contract/instrument-affected.ts";

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
  const path = relativePath(canonicalRoot, realpathSync(absolute));
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    return;
  }
  return path.split(sep).join("/");
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

function isRunnableToolingSpec(path: string): boolean {
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
  const reachedSpecs = new Set<string>();
  const seen = new Set<string>();
  const pending = [source];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const importer of importers.get(current) ?? []) {
      if (isRunnableToolingSpec(importer)) {
        reachedSpecs.add(importer);
      }
      pending.push(importer);
    }
  }
  return [...reachedSpecs].toSorted();
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
  const seen = new Set<string>();
  const pending = [source];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const basenameId = basenamePolicyId(current);
    if (basenameId !== undefined) {
      const authoredId = authoredPolicyId(root, current);
      if (authoredId === basenameId) {
        reachedPolicies.add(authoredId);
      } else {
        unclassifiableGatePaths.add(current);
      }
    }
    pending.push(...(importers.get(current) ?? []));
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
