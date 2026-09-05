// Visitor-fed tuple facts built on the final static authored-value reader.
import type { Node as MorphNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { TupleVocabularyEntry, TupleVocabularyFact, TupleVocabularyReceipt } from "../contract/tuple-vocabulary-fact.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";

export const TUPLE_VOCABULARY_VISITOR_KINDS = [SyntaxKind.VariableDeclaration] as const;

function exportedVariable(node: VariableDeclaration): boolean {
  return node.getVariableStatement()?.isExported() === true;
}

function sourceDeclaration(node: MorphNode, fallback: VariableDeclaration): VariableDeclaration {
  return node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration) ?? fallback;
}

interface UnresolvedTupleInput {
  readonly exportedName: string;
  readonly reason: Extract<TupleVocabularyFact, { readonly kind: "unresolved" }>["reason"];
  readonly detail: string;
  readonly node: MorphNode;
  readonly declarations: readonly MorphNode[];
}

function unresolved(input: UnresolvedTupleInput): TupleVocabularyFact {
  return { kind: "unresolved", ...input };
}

function readOne(exportedName: string, declarations: readonly VariableDeclaration[]): TupleVocabularyFact {
  if (declarations.length === 0) {
    return { kind: "absent", exportedName };
  }
  if (declarations.length !== 1 || declarations[0] === undefined) {
    return unresolved({
      exportedName,
      reason: "ambiguous",
      detail: `${exportedName} has ${declarations.length} exported declarations`,
      node: declarations[0] as MorphNode,
      declarations,
    });
  }
  const declaration = declarations[0];
  const symbol = { exportedName, declaration } as const;
  const initializer = declaration.getInitializer();
  if (initializer === undefined) {
    return unresolved({
      exportedName,
      reason: "missing",
      detail: `${exportedName} has no initializer`,
      node: declaration,
      declarations: [declaration],
    });
  }
  const authored = readStaticAuthoredValue(initializer);
  if (authored.kind === "unresolved") {
    return unresolved({
      exportedName,
      reason: authored.reason,
      detail: authored.detail,
      node: authored.node,
      declarations: authored.trace.declarations,
    });
  }
  if (authored.value.kind !== "tuple") {
    return unresolved({
      exportedName,
      reason: "unsupported",
      detail: `${exportedName} does not resolve to an authored tuple`,
      node: authored.value.node,
      declarations: authored.trace.declarations,
    });
  }
  if (authored.value.elements.length === 0) {
    return { kind: "empty", symbol, declarations: authored.trace.declarations };
  }
  const entries: TupleVocabularyEntry[] = [];
  for (const element of authored.value.elements) {
    if (element.kind !== "scalar" || typeof element.value !== "string") {
      return unresolved({
        exportedName,
        reason: "unsupported",
        detail: `${exportedName} contains a non-string tuple member`,
        node: element.node,
        declarations: authored.trace.declarations,
      });
    }
    entries.push({ value: element.value, node: element.node, declaration: sourceDeclaration(element.node, declaration) });
  }
  return { kind: "resolved", symbol, entries, declarations: authored.trace.declarations };
}

/** Create one invocation-local exported-tuple collector; no Project or source walk is exposed. */
export function createTupleVocabularyFacts(): {
  readonly visit: (node: MorphNode) => void;
  readonly read: (exportedName: string) => TupleVocabularyFact;
} {
  const declarations = new Map<string, VariableDeclaration[]>();
  return {
    visit: (node): void => {
      if (!(Node.isVariableDeclaration(node) && exportedVariable(node))) {
        return;
      }
      const existing = declarations.get(node.getName()) ?? [];
      existing.push(node);
      declarations.set(node.getName(), existing);
    },
    read: (exportedName) => readOne(exportedName, declarations.get(exportedName) ?? []),
  };
}

export function tupleVocabularyReceipt(fact: TupleVocabularyFact): TupleVocabularyReceipt {
  return {
    source: fact.kind === "resolved" || fact.kind === "empty" ? fact.symbol.exportedName : fact.exportedName,
    members: fact.kind === "resolved" ? fact.entries.length : 0,
    unresolved: fact.kind === "unresolved" || fact.kind === "absent" ? 1 : 0,
  };
}
