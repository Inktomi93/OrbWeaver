// The symbol verbs: refs / callers / importers / exports / jsx / ident / literal.
import { dirname, resolve } from "node:path";
import type { ExportDeclaration, ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind, ts } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { semanticReferenceNodes } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { emit, hitOf } from "../lib/emit.ts";
import { scanCorpus, WHOLE_CORPUS } from "../lib/ledger.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

/** Every exported (workspace-wide) or module-local (same-file refs still matter) declaration named `name`,
 *  over the SCANNED corpus (the caller's `scanCorpus` result — never a second walk of the project). */
export function declarationsNamed(files: readonly SourceFile[], name: string): Node[] {
  // Dedupe by node identity: `getExportedDeclarations()` resolves THROUGH re-exports, so every barrel
  // that re-exports a shape returns the SAME origin node — without this, a barreled symbol counts one
  // "declaration" per barrel (false one-home alarm) and refs run/push once per duplicate (inflated hits).
  const candidates: Node[] = [];
  for (const sf of files) {
    candidates.push(...(sf.getExportedDeclarations().get(name) ?? []));
    candidates.push(...sf.getFunctions().filter((fn) => fn.getName() === name && !fn.isExported()));
    candidates.push(...sf.getVariableDeclarations().filter((v) => v.getName() === name && !v.isExported()));
    candidates.push(...sf.getClasses().filter((decl) => decl.getName() === name && !decl.isExported()));
    candidates.push(...sf.getInterfaces().filter((decl) => decl.getName() === name && !decl.isExported()));
    candidates.push(...sf.getTypeAliases().filter((decl) => decl.getName() === name && !decl.isExported()));
    candidates.push(...sf.getEnums().filter((decl) => decl.getName() === name && !decl.isExported()));
    candidates.push(...sf.getDescendantsOfKind(SyntaxKind.MethodDeclaration).filter((decl) => decl.getName() === name));
  }
  const seen = new Set<string>();
  return candidates.filter((node) => {
    const key = `${node.getSourceFile().getFilePath()}:${node.getStart()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function cmdRefs(project: SourceCorpus, name: string, flags: Flags): void {
  const decls = declarationsNamed(scanCorpus(project, WHOLE_CORPUS), name);
  if (decls.length === 0) {
    emit([], flags, `refs ${name} (no declaration found — try \`pnpm ast ident ${name}\`)`);
    return;
  }
  const hits: Hit[] = [];
  const declStarts = new Set(decls.map((d) => `${d.getSourceFile().getFilePath()}:${d.getStart()}`));
  for (const decl of decls) {
    hits.push(hitOf(decl, "def"));
    if (Node.isReferenceFindable(decl)) {
      for (const ref of semanticReferenceNodes(decl)) {
        const key = `${ref.getSourceFile().getFilePath()}:${ref.getStart()}`;
        if (!declStarts.has(key)) {
          hits.push(hitOf(ref, "ref"));
        }
      }
    }
  }
  emit(hits, flags, `refs ${name} (${decls.length} declaration(s))`);
}

export function cmdCallers(project: SourceCorpus, name: string, flags: Flags): void {
  const hits: Hit[] = [];
  const declarations = declarationsNamed(scanCorpus(project, WHOLE_CORPUS), name);
  for (const declaration of declarations) {
    for (const reference of semanticReferenceNodes(declaration)) {
      const parent = reference.getParent();
      const expression = parent !== undefined && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === reference ? parent : reference;
      const call = expression.getParent();
      if (call !== undefined && Node.isCallExpression(call) && call.getExpression() === expression) {
        hits.push(hitOf(call, Node.isPropertyAccessExpression(expression) ? "method-call" : "call"));
      }
    }
  }
  emit(hits, flags, `callers ${name} (${declarations.length} declaration(s), identity-resolved)`);
}

function staticImporterHits(sf: SourceFile, spec: string): Hit[] {
  const out: Hit[] = [];
  const decls: Array<ImportDeclaration | ExportDeclaration> = [...sf.getImportDeclarations(), ...sf.getExportDeclarations()];
  for (const d of decls) {
    // Two independent match strategies, OR'd: (1) the raw specifier text — catches package/#alias specs
    // the caller quotes verbatim (`@orb/ui/badge`); (2) the RESOLVED target file's path — catches relative
    // specs (`../assembly/shape`, `./context`) that share no substring with a file-path query at all. Without
    // (2), querying by file path silently misses every relative importer (a false "0 importers" dead-code
    // signal) — resolution handles relative/#alias/@orb subpath uniformly (same technique as resolvedGraph).
    const raw = d.getModuleSpecifierValue();
    const rawHit = raw?.includes(spec);
    const resolved = d.getModuleSpecifierSourceFile()?.getFilePath();
    const resolvedHit = resolved?.includes(spec);
    if (rawHit === true || resolvedHit === true) {
      out.push(hitOf(d, "import"));
    }
  }
  return out;
}

function resolvedModulePath(sf: SourceFile, spec: string): string | undefined {
  if (spec.startsWith(".")) {
    const base = resolve(dirname(sf.getFilePath()), spec);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.mts`]) {
      const source = sf.getProject().getSourceFile(candidate);
      if (source !== undefined) {
        return source.getFilePath();
      }
    }
  }
  const fs = sf.getProject().getFileSystem();
  const readFile = (path: string): string | undefined => {
    let content: string | undefined;
    try {
      content = fs.readFileSync(path, "utf-8");
      // @orb-waive caught-failure-ownership(catch): TypeScript intentionally probes nonexistent module candidates; an unreadable candidate is `undefined` so resolution continues. Ends if this callback reads an already-proven-existing path.
    } catch {
      // TypeScript probes extension/package candidates that need not exist.
    }
    return content;
  };
  return ts.resolveModuleName(spec, sf.getFilePath(), sf.getProject().getCompilerOptions(), {
    directoryExists: (path) => fs.directoryExistsSync(path),
    fileExists: (path) => fs.fileExistsSync(path),
    getCurrentDirectory: () => fs.getCurrentDirectory(),
    readFile,
    realpath: (path) => fs.realpathSync(path),
  }).resolvedModule?.resolvedFileName;
}

function dynamicImporterHits(sf: SourceFile, spec: string, targets: ReadonlySet<string>): Hit[] {
  const out: Hit[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (
      arg !== undefined &&
      Node.isStringLiteral(arg) &&
      (arg.getLiteralText().includes(spec) || targets.has(resolvedModulePath(sf, arg.getLiteralText()) ?? ""))
    ) {
      out.push(hitOf(call, "dynamic-import"));
    }
  }
  return out;
}

function staticResolvedTargets(sf: SourceFile, spec: string): string[] {
  const targets: string[] = [];
  for (const declaration of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const resolved = declaration.getModuleSpecifierSourceFile()?.getFilePath();
    if (resolved !== undefined && (declaration.getModuleSpecifierValue()?.includes(spec) === true || resolved.includes(spec))) {
      targets.push(resolved);
    }
  }
  return targets;
}

function dynamicResolvedTargets(sf: SourceFile, spec: string): string[] {
  const targets: string[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const arg = call.getExpression().getKind() === SyntaxKind.ImportKeyword ? call.getArguments()[0] : undefined;
    const target =
      arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralText().includes(spec) ? resolvedModulePath(sf, arg.getLiteralText()) : undefined;
    if (target !== undefined) {
      targets.push(target);
    }
  }
  return targets;
}

function resolvedTargets(files: readonly SourceFile[], spec: string): Set<string> {
  const targets = new Set<string>();
  for (const sf of files) {
    for (const target of [...staticResolvedTargets(sf, spec), ...dynamicResolvedTargets(sf, spec)]) {
      targets.add(target);
    }
  }
  return targets;
}

function resolvedImporterHits(sf: SourceFile, targets: ReadonlySet<string>): Hit[] {
  const hits: Hit[] = [];
  for (const declaration of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const resolved = declaration.getModuleSpecifierSourceFile()?.getFilePath();
    if (resolved !== undefined && targets.has(resolved)) {
      hits.push(hitOf(declaration, "import"));
    }
  }
  return hits;
}

export function cmdImporters(project: SourceCorpus, spec: string, flags: Flags): void {
  const hits: Hit[] = [];
  const files = scanCorpus(project, WHOLE_CORPUS);
  const targetPaths = resolvedTargets(files, spec);
  for (const sf of files) {
    hits.push(...staticImporterHits(sf, spec), ...dynamicImporterHits(sf, spec, targetPaths), ...resolvedImporterHits(sf, targetPaths));
  }
  emit(hits, flags, `importers ${spec} (${targetPaths.size} resolved target(s))`);
}

export function cmdExports(project: SourceCorpus, path: string, flags: Flags): void {
  const hits: Hit[] = [];
  // The scope IS the positional arg (a file or dir path substring) — a path that matches no loaded file is
  // now the same tool error a bad package scope has always been, instead of an empty export list.
  for (const sf of scanCorpus(project, { scope: path, label: `path:${path === "" ? "(none)" : path}` })) {
    for (const [name, decls] of sf.getExportedDeclarations()) {
      const d = decls[0];
      if (d !== undefined) {
        const h = hitOf(d, "export");
        h.text = `${name}  —  ${h.text}`;
        hits.push(h);
      }
    }
  }
  emit(hits, flags, `exports ${path}`);
}

export function cmdJsx(project: SourceCorpus, name: string, flags: Flags): void {
  const hits: Hit[] = [];
  const declarations = declarationsNamed(scanCorpus(project, WHOLE_CORPUS), name);
  for (const declaration of declarations) {
    for (const reference of semanticReferenceNodes(declaration)) {
      const element = reference.getFirstAncestor((ancestor) => Node.isJsxOpeningElement(ancestor) || Node.isJsxSelfClosingElement(ancestor));
      if (element !== undefined && (Node.isJsxOpeningElement(element) || Node.isJsxSelfClosingElement(element))) {
        const tag = element.getTagNameNode();
        if (reference === tag || reference.getFirstAncestor((ancestor) => ancestor === tag) !== undefined) {
          hits.push(hitOf(element, "jsx"));
        }
      }
    }
  }
  emit(hits, flags, `jsx ${name} (${declarations.length} declaration(s), identity-resolved)`);
}

export function cmdIdent(project: SourceCorpus, name: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() === name) {
        hits.push(hitOf(id, "ident"));
      }
    }
  }
  emit(hits, flags, `ident ${name}`);
}

// ── literal: string-LITERAL-only search — the exact complement of `ident` ──────────────────────────
// `ident` never looks inside a string; this verb never looks anywhere ELSE. A value-changing merge (an
// enum member, a wire field name, a user-facing label) needs "which code/tests pin this literal" as one
// receipted command — the coupled-fixture sweep the executor doctrine's "shared-value change owes a
// BATTERY" rule keeps paying a noisy `rg` for (comments AND identifiers both false-positive on it). Runs
// over the WIDE corpus (the standard package/test/tooling/script roots plus package-root TS, MTS, and
// Playwright TSX), because that IS the point: a coupled fixture may live outside package src. Loaded WITHOUT
// the type graph (see `loadProject`'s `wide` arm) — a purely syntactic text match needs no language service,
// so the wide corpus costs the cheap load, not the typed one.
/** ONE static (non-interpolated) chunk of every `TemplateExpression` in `sf`: the `TemplateHead` plus each
 *  `TemplateSpan`'s trailing `TemplateMiddle`/`TemplateTail` — the text between `${…}` interpolations. An
 *  interpolated HOLE is never text, so it can never match; a `NoSubstitutionTemplateLiteral` (no `${}` at
 *  all) is handled separately below, as its own whole literal. */
function templateChunks(sf: SourceFile): { text: string; node: Node }[] {
  const chunks: { text: string; node: Node }[] = [];
  for (const tpl of sf.getDescendantsOfKind(SyntaxKind.TemplateExpression)) {
    const head = tpl.getHead();
    chunks.push({ text: head.getLiteralText(), node: head });
    for (const span of tpl.getTemplateSpans()) {
      const literal = span.getLiteral();
      chunks.push({ text: literal.getLiteralText(), node: literal });
    }
  }
  return chunks;
}

/** ONE file's literal-text hits: string literals, no-substitution template literals, and every static
 *  template chunk. Split off `cmdLiteral`'s loop so neither trips the complexity ceiling. */
function literalHitsIn(sf: SourceFile, value: string): Hit[] {
  const hits: Hit[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    if (node.getLiteralText().includes(value)) {
      hits.push(hitOf(node, "string-literal"));
    }
  }
  for (const node of sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    if (node.getLiteralText().includes(value)) {
      hits.push(hitOf(node, "template-literal"));
    }
  }
  for (const chunk of templateChunks(sf)) {
    if (chunk.text.includes(value)) {
      hits.push(hitOf(chunk.node, "template-chunk"));
    }
  }
  return hits;
}

export function cmdLiteral(project: SourceCorpus, value: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
    hits.push(...literalHitsIn(sf, value));
  }
  emit(hits, flags, `literal ${value}`);
}
