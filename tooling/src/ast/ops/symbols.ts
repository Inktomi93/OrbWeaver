// The symbol verbs: refs / callers / importers / exports / jsx / ident / literal.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { collectModuleImporters } from "../../floor/code-facts/module-importers.ts";
import { declarationsNamed } from "../../floor/code-facts/reference-declarations.ts";
import { literalMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import type { SourceCorpus } from "../../floor/compiler/ts-workspace.ts";
import { semanticReferenceNodes } from "../../floor/compiler/ts-workspace.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { emit, hitOf } from "../lib/emit.ts";
import { scanCorpus, WHOLE_CORPUS } from "../lib/ledger.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

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

/** The call a reference is the callee of, directly or as the name of a member callee in any spelling. */
function callerHit(reference: Node): Hit | undefined {
  const parent = reference.getParent();
  const member = parent === undefined ? undefined : literalMemberAccess(parent, true);
  const callee = member?.nameNode === reference ? member.access : reference;
  const call = callee.getParent();
  if (call === undefined || !Node.isCallExpression(call) || call.getExpression() !== callee) {
    return;
  }
  return hitOf(call, callee === reference ? "call" : "method-call");
}

export function cmdCallers(project: SourceCorpus, name: string, flags: Flags): void {
  const hits: Hit[] = [];
  const declarations = declarationsNamed(scanCorpus(project, WHOLE_CORPUS), name);
  for (const declaration of declarations) {
    for (const reference of semanticReferenceNodes(declaration)) {
      const hit = callerHit(reference);
      if (hit !== undefined) {
        hits.push(hit);
      }
    }
  }
  emit(hits, flags, `callers ${name} (${declarations.length} declaration(s), identity-resolved)`);
}

export function cmdImporters(project: SourceCorpus, spec: string, flags: Flags): void {
  const { hits, targetPaths } = collectModuleImporters(scanCorpus(project, WHOLE_CORPUS), spec);
  emit(
    hits.map(({ node, kind }) => hitOf(node, kind)),
    flags,
    `importers ${spec} (${targetPaths.size} resolved target(s))`,
  );
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
