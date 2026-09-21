// prodonly: entry-closure FILE reachability over the shipped/runtime entry surface.
import { readFileSync } from "node:fs";
import type { NewExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { emit, hitOf } from "../lib/emit.ts";
import { exitToolError, SKIP_DECLARATION_FILES, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { resolveDynamicImportTarget, resolveModule } from "../lib/resolve.ts";
import { DOT_SLASH_RE, GLOB_STAR_RE, isTestPath, REPO_ROOT, TS_SUFFIX_RE, WORKSPACE_PACKAGES } from "../lib/root.ts";
import { resolveScope } from "../lib/scope.ts";
import { relPath } from "./swallowed.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── prodonly: entry-closure FILE reachability (the knip Unused-files lens) ─────────────────────
// testonly/orphans are SYMBOL lenses; prodonly is the FILE lens they can't be. It walks the resolved
// import graph from the workspace's real PRODUCTION entry points and reports source files no entry can
// reach — the instrument that sees the whole rpg pending-seam cluster (dead FILES, not dead symbols).
//
// A file reachable ONLY from a test is prod-unreachable BY DESIGN of this lens (that's its whole point —
// it complements testonly). So tests/ + scripts/ are NOT entries and NOT graph nodes here.
/** The production entry FILES, derived honestly from runtime authorities (never analysis configuration):
 *   1. each package.json `exports` map — Node resolves
 *      `./*` across slashes, so every nested `index.ts` addressable as a subpath is an entry;
 *   2. each package.json `scripts` command's `.ts` targets ({@link scriptEntryPaths}) and the package-root
 *      TOOL CONFIG convention ({@link TOOLING_CONFIG_GLOB}) — see the tooling-entrypoint note below.
 *  index.html isn't a source file, so its `<script type=module>` target `src/main.tsx` stands in.
 *
 *  TOOLING ENTRY POINTS ARE ENTRIES (lens calibration, owner ruling 2026-08-13). `drizzle.config.ts`,
 *  `vite.config.ts` and `tokens.build.ts` are loaded BY A TOOL — by filename convention or by a package
 *  script — so no import edge points at them BY DESIGN, and the old derivation reported all three as
 *  prod-unreachable rot. They are derived, not allowlisted: a hand-written list of three paths is the same
 *  rot the ledger forbids, and this file already ate the proof — the ONE hardcoded tooling anchor here named
 *  `src/tokens/tokens.build.ts`, a path that has not existed since the file moved to the package root, and
 *  it failed SILENTLY (a hardcoded `add()` on a missing file is a no-op). Hence {@link addAnchor}: a
 *  declared anchor that resolves to nothing is now a TOOL ERROR, because a blind lens must never read clean. */
function deriveEntryFiles(project: SourceCorpus): Set<string> {
  const entries = new Set<string>();
  for (const pkg of WORKSPACE_PACKAGES) {
    const dir = `${REPO_ROOT}/packages/${pkg}`;
    for (const glob of [...exportsEntryPaths(dir), ...scriptEntryPaths(dir), ...toolingConfigNames(project, dir)]) {
      addGlobMatches(project, `${dir}/${glob}`, entries);
    }
  }
  addAnchor(project, entries, `${REPO_ROOT}/packages/client/src/main.tsx`, "index.html's <script type=module> target");
  return entries;
}

/** A build tool loads its config by FILENAME, from the package ROOT — `vite.config.ts`, `drizzle.config.ts`.
 *  Nothing imports them and nothing can: they are the tool's own entry. Matched by directory identity rather
 *  than a glob, because {@link globToRegExp} deliberately lets `*` cross slashes (Node exports semantics) and
 *  a `*.config.ts` glob would therefore also swallow a real module at `src/**\/x.config.ts`. */
const TOOLING_CONFIG_SUFFIX = ".config.ts";

export function toolingConfigNames(project: SourceCorpus, pkgDir: string): string[] {
  const names: string[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    const slash = fp.lastIndexOf("/");
    if (fp.slice(0, slash) === pkgDir && fp.endsWith(TOOLING_CONFIG_SUFFIX)) {
      names.push(fp.slice(slash + 1));
    }
  }
  return names;
}

const SCRIPT_TS_TOKEN_RE = /[\w./-]+\.tsx?\b/gu;

/** The `.ts`/`.tsx` targets named by a package's own `scripts` commands (`node tokens.build.ts` →
 *  `tokens.build.ts`) — the same auto-detection knip performs, read off the same package.json. A token that
 *  resolves to no source file is simply not an entry; the glob matcher already ignores it. */
export function scriptEntryPaths(pkgDir: string): string[] {
  const raw = readFileSync(`${pkgDir}/package.json`, "utf8");
  const scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {};
  return Object.values(scripts)
    .flatMap((cmd) => cmd.match(SCRIPT_TS_TOKEN_RE) ?? [])
    .map((token) => token.replace(DOT_SLASH_RE, ""));
}

/** A NAMED anchor entry (a path this file asserts is an entry, derived from something outside the TS graph).
 *  A missing anchor is a TOOL ERROR, never a silent skip: the whole package it anchors would report as
 *  prod-unreachable rot, and that reads exactly like a real finding. */
function addAnchor(project: SourceCorpus, entries: Set<string>, fp: string, why: string): void {
  if (project.getSourceFile(fp) === undefined) {
    exitToolError(
      `ast prodonly: the declared entry anchor ${relPath(fp)} (${why}) does not exist — the entry closure is WRONG, so every file it reaches would report as prod-unreachable. Fix the anchor in deriveEntryFiles, do not act on this run.`,
    );
  }
  entries.add(fp);
}

// The .ts/.tsx targets of a package.json exports map (relative to the package dir), stars kept as glob
// tokens for the resolver. This is the entry surface knip auto-detects for ui/server/client.
function exportsEntryPaths(pkgDir: string): string[] {
  const raw = readFileSync(`${pkgDir}/package.json`, "utf8");
  const exp = (JSON.parse(raw) as { exports?: Record<string, string> }).exports ?? {};
  return Object.values(exp)
    .filter((v) => typeof v === "string" && TS_SUFFIX_RE.test(v))
    .map((v) => v.replace(DOT_SLASH_RE, ""));
}

/** Add every project source file matching an absolute glob (`*` = one path segment, `**` = many) to `set`.
 *  Node's exports `*` matches across slashes, so a single-`*` exports pattern is treated as `**` here. */
function addGlobMatches(project: SourceCorpus, absGlob: string, set: Set<string>): void {
  if (!absGlob.includes("*")) {
    if (project.getSourceFile(absGlob) !== undefined) {
      set.add(absGlob);
    }
    return;
  }
  const re = globToRegExp(absGlob);
  for (const sf of project.getSourceFiles()) {
    if (re.test(sf.getFilePath())) {
      set.add(sf.getFilePath());
    }
  }
}

const GLOB_META_RE = /[.+^${}()|[\]\\]/gu;

// Absolute glob to anchored RegExp. Every run of stars matches any chars incl slashes (Node exports
// semantics: a single-star exports pattern such as the contracts/db one addresses every nested index).
function globToRegExp(absGlob: string): RegExp {
  const escaped = absGlob.replace(GLOB_META_RE, "\\$&").replace(GLOB_STAR_RE, ".*");
  return new RegExp(`^${escaped}$`, "u");
}

function isImportMetaUrl(node: Node): boolean {
  if (!Node.isPropertyAccessExpression(node) || node.getName() !== "url") {
    return false;
  }
  const receiver = node.getExpression();
  return receiver.getKind() === SyntaxKind.MetaProperty && receiver.getFirstChildByKind(SyntaxKind.ImportKeyword) !== undefined;
}

function staticWorkerSpecifier(node: Node): string | undefined {
  return Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node) ? node.getLiteralText() : undefined;
}

/** Resolve Vite's static worker-entry form without promoting ordinary `new URL(...)` assets. The path and
 *  `import.meta.url` base must both be literal syntax: a computed path is a runtime choice this graph cannot
 *  resolve honestly. */
function resolveWorkerEntryTarget(expression: NewExpression, sf: SourceFile, project: SourceCorpus): SourceFile | undefined {
  const workerConstructor = expression.getExpression();
  if (!(Node.isIdentifier(workerConstructor) && workerConstructor.getText() === "Worker")) {
    return;
  }
  const url = expression.getArguments()[0];
  if (!(url !== undefined && Node.isNewExpression(url))) {
    return;
  }
  const urlConstructor = url.getExpression();
  const [path, base] = url.getArguments();
  if (!(Node.isIdentifier(urlConstructor) && urlConstructor.getText() === "URL") || path === undefined || base === undefined || !isImportMetaUrl(base)) {
    return;
  }
  const specifier = staticWorkerSpecifier(path);
  if (specifier === undefined) {
    return;
  }
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    return;
  }
  return resolveModule(project, sf.getDirectoryPath(), specifier);
}

function workerEntryTargets(sf: SourceFile, project: SourceCorpus): SourceFile[] {
  const targets: SourceFile[] = [];
  for (const expression of sf.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const target = resolveWorkerEntryTarget(expression, sf, project);
    if (target !== undefined) {
      targets.push(target);
    }
  }
  return targets;
}

// Resolved out-edges of a file: every static import / re-export target (named, namespace, star, alias,
// and @orb subpath all resolve via getModuleSpecifierSourceFile), dynamic import() targets, and Vite's
// static relative Worker(new URL(..., import.meta.url)) entries.
function fileEdges(sf: SourceFile, project: SourceCorpus): SourceFile[] {
  const out: SourceFile[] = [];
  for (const d of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const t = d.getModuleSpecifierSourceFile();
    if (t !== undefined) {
      out.push(t);
    }
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg !== undefined && Node.isStringLiteral(arg)) {
      const t = resolveModule(project, sf.getDirectoryPath(), arg.getLiteralText()) ?? resolveDynamicImportTarget(call);
      if (t !== undefined) {
        out.push(t);
      }
    }
  }
  out.push(...workerEntryTargets(sf, project));
  return out;
}

/** Files reachable from the entry set by a resolved-edge BFS (no test files as nodes — a test importer
 *  cannot keep a prod file alive in this lens). */
function reachableFrom(entries: Set<string>, project: SourceCorpus): Set<string> {
  const seen = new Set<string>(entries);
  const stack = [...entries];
  while (stack.length > 0) {
    const fp = stack.pop();
    const sf = fp === undefined ? undefined : project.getSourceFile(fp);
    if (sf === undefined) {
      continue;
    }
    for (const t of fileEdges(sf, project)) {
      const tp = t.getFilePath();
      if (!(seen.has(tp) || isTestPath(tp))) {
        seen.add(tp);
        stack.push(tp);
      }
    }
  }
  return seen;
}

/** Source FILES in `<scope>` no production entry can reach (the knip Unused-files verdict, entry-closure
 *  from the package exports maps). A file reached only from a test is prod-unreachable — the point of the
 *  lens. Complements testonly's per-symbol view. */
export function cmdProdOnly(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "prodonly");
  // `.d.ts` ambient declarations are consumed by the type system, never by an import edge — they are
  // never "reachable" and are not orphans (knip excludes them from unused-files too).
  const files = scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES, SKIP_DECLARATION_FILES] });
  const reachable = reachableFrom(deriveEntryFiles(project), project);
  const hits: Hit[] = [];
  for (const sf of files) {
    if (!reachable.has(sf.getFilePath())) {
      hits.push(hitOf(sf, "prod-unreachable"));
    }
  }
  emit(hits, flags, `prodonly ${scope.label} (entry closure from package.json exports + runtime tool entries)`);
}
