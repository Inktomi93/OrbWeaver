// The symbol verbs: refs / callers / importers / exports / jsx / ident / literal.
import type { ExportDeclaration, ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
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
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      const isMethod = Node.isPropertyAccessExpression(expr);
      const tail = isMethod ? expr.getName() : expr.getText();
      if (tail === name) {
        hits.push(hitOf(call, isMethod ? "method-call" : "call"));
      }
    }
  }
  emit(hits, flags, `callers ${name}`);
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

function dynamicImporterHits(sf: SourceFile, spec: string): Hit[] {
  const out: Hit[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralText().includes(spec)) {
      out.push(hitOf(call, "dynamic-import"));
    }
  }
  return out;
}

export function cmdImporters(project: SourceCorpus, spec: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
    hits.push(...staticImporterHits(sf, spec), ...dynamicImporterHits(sf, spec));
  }
  emit(hits, flags, `importers ${spec}`);
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
  for (const sf of scanCorpus(project, WHOLE_CORPUS)) {
    for (const kind of [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement] as const) {
      for (const el of sf.getDescendantsOfKind(kind)) {
        if (el.getTagNameNode().getText() === name) {
          hits.push(hitOf(el, "jsx"));
        }
      }
    }
  }
  emit(hits, flags, `jsx ${name}`);
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
