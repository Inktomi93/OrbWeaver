// Native SQL capture serializes source facts; replay never asks a syntax carrier for Type or Symbol meaning.
import type { Node } from "ts-morph";
import { Node as MorphNode } from "ts-morph";
import type { DrizzlePredicate } from "./drizzle-predicate-contract.ts";
import type { InventoryDrizzleSqlFacts, InventorySqlPredicateTerm, NativeDrizzleSqlFacts } from "./drizzle-sql-facts-contract.ts";
import { replayReferenceFact, wireReferenceFact } from "./projection-reference-codec.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";

/** Encode each bound alternative separately, including absence and unresolved containment. */
export function encodeDrizzleSqlFacts(facts: NativeDrizzleSqlFacts, span: (node: Node) => InventorySpan): InventoryDrizzleSqlFacts {
  const terms: InventorySqlPredicateTerm[] = [];
  const term = (fact: DrizzlePredicate): number => {
    const common = { node: span(fact.node), contained: fact.contained, presence: fact.presence };
    if (fact.kind === "and" || fact.kind === "or" || fact.kind === "choice") {
      terms.push({ ...common, kind: fact.kind, terms: fact.terms.map(term) });
    } else if (fact.kind === "leaf") {
      terms.push({ ...common, kind: fact.kind, bindings: [...fact.bindings].map(([parameter, value]) => [span(parameter), span(value)] as const) });
    } else {
      terms.push({ ...common, kind: fact.kind });
    }
    return terms.length - 1;
  };
  const predicates = [...facts.predicates].map(([node, fact]) => ({ node: span(node), root: term(fact) }));
  return {
    statements: [...facts.statements].map(([node, fact]) => ({
      node: span(node),
      wheres: fact.wheres.map(span),
      innerOns: fact.innerOns.map(span),
      escapes: fact.escapes,
      refusals: fact.refusals.map((value) => {
        const wire = wireReferenceFact(value, () => null, span);
        if (wire.kind !== "unresolved") {
          throw new SemanticInventoryError("native SQL statement refusal became resolved");
        }
        return wire;
      }),
    })),
    predicates,
    terms,
    consumers: [...facts.consumers].map(([node, fact]) => ({ node: span(node), fact: wireReferenceFact(fact, (calls) => calls.map(span), span) })),
  };
}

/** Native binding maps and physical consumers replay only from admitted canonical spans. */
export function replayDrizzleSqlFacts(wire: InventoryDrizzleSqlFacts, replay: (span: InventorySpan) => Node): NativeDrizzleSqlFacts {
  const terms: DrizzlePredicate[] = [];
  for (const value of wire.terms) {
    const common = { node: replay(value.node), contained: value.contained, presence: value.presence };
    if (value.kind === "and" || value.kind === "or" || value.kind === "choice") {
      terms.push({ ...common, kind: value.kind, terms: value.terms.map((index) => requiredTerm(terms, index)) });
    } else if (value.kind === "leaf") {
      terms.push({ ...common, kind: value.kind, bindings: new Map(value.bindings.map(([parameter, supplied]) => [replay(parameter), replay(supplied)])) });
    } else {
      terms.push({ ...common, kind: value.kind });
    }
  }
  return {
    statements: new Map(
      wire.statements.map(({ node, refusals, ...fact }) => [
        replay(node),
        {
          ...fact,
          wheres: fact.wheres.map(replay),
          innerOns: fact.innerOns.map(replay),
          refusals: refusals.map((value) => {
            const refusal = replayReferenceFact(value, () => null, replay);
            if (refusal.kind !== "unresolved") {
              throw new SemanticInventoryError("native SQL statement refusal became resolved");
            }
            return refusal;
          }),
        },
      ]),
    ),
    predicates: new Map(wire.predicates.map(({ node, root }) => [replay(node), requiredTerm(terms, root)])),
    consumers: new Map(
      wire.consumers.map(({ node, fact }) => [
        replay(node),
        replayReferenceFact(
          fact,
          (calls) =>
            calls.map((span) => {
              const call = replay(span);
              if (!MorphNode.isCallExpression(call)) {
                throw new SemanticInventoryError("native SQL consumer is not a call");
              }
              return call;
            }),
          replay,
        ),
      ]),
    ),
  };
}

function requiredTerm(terms: readonly DrizzlePredicate[], index: number): DrizzlePredicate {
  const value = terms[index];
  if (value === undefined) {
    throw new SemanticInventoryError("native SQL predicate term is missing or foreign");
  }
  return value;
}
