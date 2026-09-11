// Visitor-fed tuple facts built on the final static authored-value reader.
import type { Node as MorphNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { TupleVocabularies, TupleVocabularyEntry, TupleVocabularyFact, TupleVocabularyReceipt } from "../contract/tuple-vocabulary-fact.ts";
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
  readonly indexed: () => number;
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
    indexed: () => declarations.size,
  };
}

/** The exported-tuple index, shared by every policy that judges a derived vocabulary.
 *
 *  Its population is exactly the packages whose exported tuples the consuming policies read: `@client`
 *  (`CHROME_ZONES`), `@server` (`WARNING_CODES`) and `@contracts` (`CHAT_WARNING_CODES`). A tuple name
 *  claimed by two exported declarations anywhere in that population is an `ambiguous` refusal at read
 *  time, never a silently narrowed vocabulary, and an index that collected nothing refuses outright
 *  rather than answering `absent` for every name.
 *
 *  THE RECEIPT STATES WHAT THIS COLLECTOR MEASURED — the authored sources it walked — never what it FOUND
 *  (#1962). It was `members: indexed` (the size of the index it built) until 2026-09-11, and
 *  `factReceiptFailures` (`lib/policy-pass.ts:641`) refuses `members === 0` and withholds every consumer
 *  before `evaluate` (`:679`), which is how a census becomes its own accuser's gag. EMPTINESS PER NAME rides
 *  the fact itself: `read(name)` answers `absent`, and every consumer files
 *  `tupleVocabularyReceipt(<what it read>)` as its OWN policy receipt — which refuses with zero members, one
 *  phase later, for that consumer only. That per-consumer door is the blindness tripwire, not this receipt.
 *
 *  THE `indexed === 0` REFUSAL ABOVE SURVIVES DELIBERATELY and is a narrower claim than the retired receipt:
 *  not "this vocabulary is empty" but "this collector indexed nothing at all across @client + @server +
 *  @contracts", which no real or fixture corpus carrying a single exported variable can produce, and which
 *  would otherwise answer `absent` for every name and read as a unanimous, confident nothing. It blocks no
 *  consumer arm — an absent-vocabulary fixture needs only one unrelated exported variable to index. */
export const tupleVocabularyFact = defineFact({
  id: "tuple-vocabularies",
  population: { in: ["@client", "@server", "@contracts"] },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const collector = createTupleVocabularyFacts();
    let result: TupleVocabularies | undefined;
    return {
      visitors: [{ kinds: TUPLE_VOCABULARY_VISITOR_KINDS, visit: collector.visit }],
      finish: (): TupleVocabularies => {
        if (result !== undefined) {
          return result;
        }
        const indexed = collector.indexed();
        if (indexed === 0) {
          throw new Error("tuple vocabulary index collected no exported variable declaration in its effective population");
        }
        ctx.receipt({ kind: "population", source: "tuple-vocabulary-sources", members: ctx.files.length });
        result = Object.freeze({ read: collector.read, indexed });
        return result;
      },
    };
  },
});

export function tupleVocabularyReceipt(fact: TupleVocabularyFact): TupleVocabularyReceipt {
  return {
    source: fact.kind === "resolved" || fact.kind === "empty" ? fact.symbol.exportedName : fact.exportedName,
    members: fact.kind === "resolved" ? fact.entries.length : 0,
    unresolved: fact.kind === "unresolved" || fact.kind === "absent" ? 1 : 0,
  };
}
