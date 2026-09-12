// The pure population algebra shared by gate dispatch, whole-population evaluation, and report counts.
// Every public door validates instead of treating malformed descriptor data as an admit-all default.
import type { LoadableExt, PopulationExpr, PopulationRef, PopulationRoot, ResolvedPopulation } from "../contract/population.ts";
import { POPULATION_ROOTS, POPULATION_SETS } from "../contract/population.ts";
import { POLICY_PASS_REFUSALS } from "../contract/policy-pass.ts";

const ROOT_REFS = new Set<string>(Object.keys(POPULATION_ROOTS));
const SET_REFS = new Set<string>(Object.keys(POPULATION_SETS));
const EXPRESSION_KEYS = new Set(["in", "not", "under", "notUnder", "named", "notNamed", "ext", "notExt", "depth"]);
const SENTINEL_KEYS = new Set(["of", "why"]);
const ALL_SENTINEL_KEYS = new Set(["of", "why", "notUnder"]);
const LOADABLE_EXTENSIONS = new Set<string>(["ts", "tsx"] satisfies readonly LoadableExt[]);
const ASCII_C0_MAX = 0x1f;
const ASCII_DELETE = 0x7f;

function invalid(detail: string): never {
  throw new Error(`Invalid population expression: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReadonlyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    invalid(`unknown property ${JSON.stringify(unknown)}`);
  }
}

function assertRef(value: unknown): asserts value is PopulationRef {
  if (typeof value !== "string" || !(ROOT_REFS.has(value) || SET_REFS.has(value))) {
    invalid(`unknown ref ${JSON.stringify(value)}`);
  }
}

function assertNonEmptyUniqueArray(value: unknown, label: string, assertMember: (member: unknown) => void): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`${label} must be a non-empty array`);
  }
  const seen = new Set<unknown>();
  for (const member of value) {
    assertMember(member);
    if (seen.has(member)) {
      invalid(`${label} contains duplicate member ${JSON.stringify(member)}`);
    }
    seen.add(member);
  }
}

function hasAsciiControl(value: string): boolean {
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= ASCII_C0_MAX || codePoint === ASCII_DELETE)) {
      return true;
    }
  }
  return false;
}

function assertPattern(value: unknown, label: "under" | "notUnder" | "named" | "notNamed"): void {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || hasAsciiControl(value)) {
    invalid(`${label} members must be non-empty strings without surrounding whitespace`);
  }
  if (value.startsWith("/") || /^[A-Za-z]:\//u.test(value) || value.includes("\\")) {
    invalid(`${label} member ${JSON.stringify(value)} must be repo-relative POSIX syntax`);
  }
  if (label !== "under" && label !== "notUnder" && value.includes("/")) {
    invalid(`${label} member ${JSON.stringify(value)} must match a basename, not a path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    invalid(`${label} member ${JSON.stringify(value)} contains an invalid path segment`);
  }
}

function assertExtension(value: unknown): void {
  if (typeof value !== "string" || !LOADABLE_EXTENSIONS.has(value)) {
    invalid(`extension ${JSON.stringify(value)} is not loadable`);
  }
}

function expandedRoots(refs: readonly PopulationRef[]): readonly PopulationRoot[] {
  const roots = new Set<PopulationRoot>();
  for (const ref of refs) {
    if (ROOT_REFS.has(ref)) {
      roots.add(ref as PopulationRoot);
      continue;
    }
    for (const root of POPULATION_SETS[ref as keyof typeof POPULATION_SETS]) {
      roots.add(root);
    }
  }
  return [...roots];
}

function rootPaths(refs: readonly PopulationRef[]): readonly string[] {
  return expandedRoots(refs).flatMap((root) => POPULATION_ROOTS[root]);
}

function assertOptionalArray(value: unknown, label: string, assertMember: (member: unknown) => void): void {
  if (value !== undefined) {
    assertNonEmptyUniqueArray(value, label, assertMember);
  }
}

function assertCompatibleFilters(value: Record<string, unknown>): void {
  const ext = value["ext"] as readonly LoadableExt[] | undefined;
  const notExt = value["notExt"] as readonly LoadableExt[] | undefined;
  if (ext?.some((member) => notExt?.includes(member) === true) === true) {
    invalid("ext and notExt contradict each other");
  }
  const named = value["named"] as readonly string[] | undefined;
  const notNamed = value["notNamed"] as readonly string[] | undefined;
  if (named?.some((member) => notNamed?.includes(member) === true) === true) {
    invalid("named and notNamed contradict each other");
  }
  const under = value["under"] as readonly string[] | undefined;
  const notUnder = value["notUnder"] as readonly string[] | undefined;
  if (under?.some((member) => notUnder?.includes(member) === true) === true) {
    invalid("under and notUnder contradict each other");
  }
}

function assertMeaningfulSubtraction(value: Record<string, unknown>): void {
  const excludedRefs = value["not"] as readonly PopulationRef[] | undefined;
  if (excludedRefs === undefined) {
    return;
  }
  const included = rootPaths(value["in"] as readonly PopulationRef[]);
  const excluded = rootPaths(excludedRefs);
  for (const excludedRef of excludedRefs) {
    const memberRoots = rootPaths([excludedRef]);
    if (!memberRoots.some((root) => included.some((includedRoot) => root.startsWith(includedRoot) || includedRoot.startsWith(root)))) {
      invalid(`not member ${JSON.stringify(excludedRef)} does not overlap the included population`);
    }
  }
  if (included.every((root) => excluded.some((excludedRoot) => root.startsWith(excludedRoot)))) {
    invalid("not subtracts the entire included population");
  }
}

function assertOperatorExpr(value: Record<string, unknown>): void {
  assertExactKeys(value, EXPRESSION_KEYS);
  assertNonEmptyUniqueArray(value["in"], "in", assertRef);
  assertOptionalArray(value["not"], "not", assertRef);
  assertOptionalArray(value["under"], "under", (member) => assertPattern(member, "under"));
  assertOptionalArray(value["notUnder"], "notUnder", (member) => assertPattern(member, "notUnder"));
  assertOptionalArray(value["named"], "named", (member) => assertPattern(member, "named"));
  assertOptionalArray(value["notNamed"], "notNamed", (member) => assertPattern(member, "notNamed"));
  assertOptionalArray(value["ext"], "ext", assertExtension);
  assertOptionalArray(value["notExt"], "notExt", assertExtension);
  if (value["depth"] !== undefined && value["depth"] !== "flat") {
    invalid('depth must be "flat"');
  }
  assertCompatibleFilters(value);
  assertMeaningfulSubtraction(value);
}

export function assertPopulationExpr(value: unknown): asserts value is PopulationExpr {
  if (typeof value === "string") {
    assertRef(value);
    return;
  }
  if (isReadonlyArray(value)) {
    assertNonEmptyUniqueArray(value, "population union", assertRef);
    return;
  }
  if (!isRecord(value)) {
    invalid("expected a ref, ref union, operator object, or reasoned sentinel");
  }
  if ("of" in value) {
    assertExactKeys(value, value["of"] === "all" ? ALL_SENTINEL_KEYS : SENTINEL_KEYS);
    if ((value["of"] !== "all" && value["of"] !== "none") || typeof value["why"] !== "string" || value["why"].trim().length === 0) {
      invalid('sentinel requires of "all" or "none" and a non-empty why');
    }
    if (value["of"] === "all") {
      assertOptionalArray(value["notUnder"], "notUnder", (member) => assertPattern(member, "notUnder"));
    }
    return;
  }
  assertOperatorExpr(value);
}

function assertRepoRelativePosixPath(value: string): void {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    hasAsciiControl(value) ||
    value.startsWith("/") ||
    /^[A-Za-z]:\//u.test(value) ||
    value.endsWith("/") ||
    value.includes("\\")
  ) {
    throw new Error(`Invalid repository path ${JSON.stringify(value)}: expected a repo-relative POSIX file path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`Invalid repository path ${JSON.stringify(value)}: invalid path segment`);
  }
}

function globRegex(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += /[\\^$.*+?()[\]{}|]/u.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`, "u");
}

function compilePatterns(patterns: readonly string[] | undefined): readonly RegExp[] | undefined {
  return patterns?.map(globRegex);
}

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function hasRoot(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => path.startsWith(root));
}

function isFlatChild(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => path.startsWith(root) && !path.slice(root.length).includes("/"));
}

function passesNameFilters(basename: string, named: readonly RegExp[] | undefined, notNamed: readonly RegExp[] | undefined): boolean {
  if (named !== undefined && !matchesAny(basename, named)) {
    return false;
  }
  return notNamed === undefined || !matchesAny(basename, notNamed);
}

function passesExtensionFilters(extension: string, ext: readonly LoadableExt[] | undefined, notExt: readonly LoadableExt[] | undefined): boolean {
  if (ext !== undefined && !ext.includes(extension as LoadableExt)) {
    return false;
  }
  return notExt === undefined || !notExt.includes(extension as LoadableExt);
}

function compileOperator(expr: Extract<PopulationExpr, { readonly in: readonly PopulationRef[] }>): (path: string) => boolean {
  const includedRoots = rootPaths(expr.in);
  const excludedRoots = expr.not === undefined ? undefined : rootPaths(expr.not);
  const depth = expr.depth;
  const under = compilePatterns(expr.under);
  const notUnder = compilePatterns(expr.notUnder);
  const named = compilePatterns(expr.named);
  const notNamed = compilePatterns(expr.notNamed);
  const ext = expr.ext === undefined ? undefined : [...expr.ext];
  const notExt = expr.notExt === undefined ? undefined : [...expr.notExt];
  return (path) => {
    if (!hasRoot(path, includedRoots) || (excludedRoots !== undefined && hasRoot(path, excludedRoots))) {
      return false;
    }
    if (depth === "flat" && !isFlatChild(path, includedRoots)) {
      return false;
    }
    if (under !== undefined && !matchesAny(path, under)) {
      return false;
    }
    if (notUnder !== undefined && matchesAny(path, notUnder)) {
      return false;
    }
    const basename = path.slice(path.lastIndexOf("/") + 1);
    if (!passesNameFilters(basename, named, notNamed)) {
      return false;
    }
    const extension = basename.slice(basename.lastIndexOf(".") + 1);
    return passesExtensionFilters(extension, ext, notExt);
  };
}

/** Compile one validated descriptor expression into the predicate reused across its candidate manifest. */
export function compilePopulation(expr: PopulationExpr): (repoRelativePosixPath: string) => boolean {
  assertPopulationExpr(expr);
  let includes: (path: string) => boolean;
  if (typeof expr === "string") {
    const roots = rootPaths([expr]);
    includes = (path): boolean => hasRoot(path, roots);
  } else if (isReadonlyArray(expr)) {
    const roots = rootPaths(expr as readonly PopulationRef[]);
    includes = (path): boolean => hasRoot(path, roots);
  } else if ("of" in expr) {
    const admitted = expr.of === "all";
    const notUnder = expr.of === "all" ? compilePatterns(expr.notUnder) : undefined;
    includes = (path): boolean => admitted && (notUnder === undefined || !matchesAny(path, notUnder));
  } else {
    includes = compileOperator(expr);
  }
  return (repoRelativePosixPath) => {
    assertRepoRelativePosixPath(repoRelativePosixPath);
    return includes(repoRelativePosixPath);
  };
}

export function populationIncludes(expr: PopulationExpr, repoRelativePosixPath: string): boolean {
  return compilePopulation(expr)(repoRelativePosixPath);
}

export function resolvePopulation(expr: PopulationExpr, candidatePaths: readonly string[]): ResolvedPopulation {
  const includes = compilePopulation(expr);
  const candidates = [...new Set(candidatePaths)];
  const paths = candidates.filter(includes).sort();
  const explicitNone = isRecord(expr) && "of" in expr && expr["of"] === "none";
  if (!explicitNone && candidates.length === 0) {
    throw new Error(POLICY_PASS_REFUSALS.populationEmptyCorpus);
  }
  if (!explicitNone && paths.length === 0) {
    throw new Error(`${POLICY_PASS_REFUSALS.populationAdmittedZero} ${candidates.length} candidate(s)`);
  }
  return {
    paths,
    admitted: paths.length,
    rejected: candidates.length - paths.length,
    candidates: candidates.length,
  };
}
