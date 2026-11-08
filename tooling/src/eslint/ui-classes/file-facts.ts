// What one TSX file renders and calls, computed once: the base every cohort column reads.
import ts from "typescript";
import type { Elem, Source } from "./source.ts";
import { childrenText, elementsOf, visit } from "./source.ts";

export interface FileFacts {
  readonly source: Source;
  readonly elems: readonly Elem[];
  readonly tags: ReadonlySet<string>;
  readonly calls: ReadonlySet<string>;
  /** Relative import specifiers by local name, for the one-hop wrapper check. */
  readonly relativeImports: ReadonlyMap<string, string>;
}

function callNames(sf: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  visit(sf, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      names.add(node.expression.text);
    }
  });
  return names;
}

function relativeImportsOf(sf: ts.SourceFile): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const statement of sf.statements) {
    if (!(ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith("."))) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const specifier of bindings.elements) {
        map.set(specifier.name.text, statement.moduleSpecifier.text);
      }
    }
  }
  return map;
}

export function factsOf(source: Source): FileFacts | null {
  if (source.sf === null || source.kind !== "tsx") {
    return null;
  }
  const elems = elementsOf(source.sf);
  return { source, elems, tags: new Set(elems.map((elem) => elem.tag)), calls: callNames(source.sf), relativeImports: relativeImportsOf(source.sf) };
}

export function firstLine(facts: FileFacts, ...tags: readonly string[]): number {
  return facts.elems.find((elem) => tags.includes(elem.tag))?.line ?? 1;
}

export function hasAny(facts: FileFacts, ...tags: readonly string[]): boolean {
  return tags.some((tag) => facts.tags.has(tag));
}

/** The word a `{DIALOG_VERBS.<key>}` child prints: `packages/client/src/lib/dialog-verbs.ts` spells each verb as its key with a capital first letter. */
export function dialogVerbOf(element: ts.JsxElement | ts.JsxSelfClosingElement): string | null {
  const [only, ...rest] = ts.isJsxElement(element) ? element.children.filter((child) => !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces)) : [];
  const read = only !== undefined && rest.length === 0 && ts.isJsxExpression(only) ? only.expression : undefined;
  if (read === undefined || !ts.isPropertyAccessExpression(read) || !ts.isIdentifier(read.expression) || read.expression.text !== "DIALOG_VERBS") {
    return null;
  }
  const key = read.name.text;
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

/** Button-like elements whose text is one of the words, written literally or as the shared `DIALOG_VERBS` member. */
export function buttonWithText(facts: FileFacts, words: ReadonlySet<string>): boolean {
  const sf = facts.source.sf;
  return (
    sf !== null &&
    facts.elems.some(
      (elem) => /^(?:Button|GlyphButton|InlineAction)$/u.test(elem.tag) && words.has(childrenText(elem.element) ?? dialogVerbOf(elem.element) ?? ""),
    )
  );
}

/** An ancestor of the element is one of the tags. */
export function insideTag(elem: Elem, tags: ReadonlySet<string>): boolean {
  for (let node: ts.Node = elem.element.parent; !ts.isSourceFile(node); node = node.parent) {
    if (ts.isJsxElement(node) && tags.has(node.openingElement.tagName.getText())) {
      return true;
    }
  }
  return false;
}
