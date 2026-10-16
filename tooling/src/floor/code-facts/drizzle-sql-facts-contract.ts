// SQL facts retain native statement lifetime and bound predicate alternatives, never tenancy authority.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { z } from "zod";
import type { DrizzlePredicate } from "./drizzle-predicate-contract.ts";
import { DRIZZLE_PREDICATE_GROUP_KINDS, DRIZZLE_PREDICATE_PRESENCES, DRIZZLE_PREDICATE_TERMINAL_KINDS } from "./drizzle-predicate-contract.ts";
import type { ReadStatement } from "./drizzle-query-contract.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { InventoryInvocationReference, InventoryInvocationRefusal, InventorySpan } from "./semantic-inventory-contract.ts";

export interface NativeDrizzleSqlFacts {
  readonly statements: ReadonlyMap<Node, ReadStatement>;
  readonly predicates: ReadonlyMap<Node, DrizzlePredicate>;
  readonly consumers: ReadonlyMap<Node, ReferenceFact<readonly CallExpression[]>>;
}

export type CapturedDrizzleSqlFacts = {
  readonly [Key in keyof NativeDrizzleSqlFacts]: Map<Node, NativeDrizzleSqlFacts[Key] extends ReadonlyMap<Node, infer Value> ? Value : never>;
};

export interface DrizzleSqlReader {
  readonly statement: (node: Node) => ReadStatement;
  readonly predicate: (node: Node) => DrizzlePredicate;
  readonly consumers: (node: Node) => ReferenceFact<readonly CallExpression[]>;
}

export type InventorySqlPredicateTerm = (
  | { readonly kind: (typeof DRIZZLE_PREDICATE_GROUP_KINDS)[number]; readonly terms: readonly number[] }
  | { readonly kind: "leaf"; readonly bindings: readonly (readonly [InventorySpan, InventorySpan])[] }
  | { readonly kind: (typeof DRIZZLE_PREDICATE_TERMINAL_KINDS)[number] }
) & { readonly node: InventorySpan; readonly contained: boolean; readonly presence: DrizzlePredicate["presence"] };

export interface InventoryDrizzleSqlFacts {
  readonly statements: readonly {
    readonly node: InventorySpan;
    readonly wheres: readonly InventorySpan[];
    readonly innerOns: readonly InventorySpan[];
    readonly escapes: boolean;
    readonly refusals: readonly InventoryInvocationRefusal[];
  }[];
  readonly predicates: readonly { readonly node: InventorySpan; readonly root: number }[];
  readonly terms: readonly InventorySqlPredicateTerm[];
  readonly consumers: readonly { readonly node: InventorySpan; readonly fact: InventoryInvocationReference<readonly InventorySpan[]> }[];
}

/** Flat child-before-parent terms preserve repeated syntax under different supplied bindings. */
export function drizzleSqlFactsSchema(
  span: z.ZodType<InventorySpan>,
  refusal: z.ZodType<InventoryInvocationRefusal>,
  reference: <Value>(value: z.ZodType<Value>) => z.ZodType<InventoryInvocationReference<Value>>,
): z.ZodType<InventoryDrizzleSqlFacts> {
  const common = { node: span, contained: z.boolean(), presence: z.enum(DRIZZLE_PREDICATE_PRESENCES) };
  const index = z.number().int().nonnegative();
  const call = span.refine((node) => node.kind === SyntaxKind.CallExpression);
  return z.strictObject({
    statements: z.array(z.strictObject({ node: call, wheres: z.array(span), innerOns: z.array(span), escapes: z.boolean(), refusals: z.array(refusal) })),
    predicates: z.array(z.strictObject({ node: span, root: index })),
    terms: z.array(
      z.discriminatedUnion("kind", [
        z.strictObject({ ...common, kind: z.enum(DRIZZLE_PREDICATE_GROUP_KINDS), terms: z.array(index) }),
        z.strictObject({ ...common, kind: z.literal("leaf"), bindings: z.array(z.tuple([span, span])) }),
        z.strictObject({ ...common, kind: z.enum(DRIZZLE_PREDICATE_TERMINAL_KINDS) }),
      ]),
    ),
    consumers: z.array(z.strictObject({ node: call, fact: reference(z.array(call)) })),
  });
}

/** Complete registered seeds and predicate roots are required even when their results are empty. */
export function assertDrizzleSqlCoverage(
  facts: InventoryDrizzleSqlFacts | undefined,
  seeds: readonly InventorySpan[] | undefined,
  predicates: readonly InventorySpan[],
  key: (node: InventorySpan) => string,
): void {
  if ((seeds !== undefined) !== (facts !== undefined)) {
    throw new Error("native SQL facts are missing or unrequested");
  }
  if (facts === undefined || seeds === undefined) {
    return;
  }
  const exact = (actual: readonly InventorySpan[], expected: readonly InventorySpan[]): boolean => {
    const keys = new Set(expected.map(key));
    return actual.length === keys.size && new Set(actual.map(key)).size === actual.length && actual.every((node) => keys.has(key(node)));
  };
  if (
    !(
      exact(
        facts.statements.map((row) => row.node),
        seeds,
      ) &&
      exact(
        facts.consumers.map((row) => row.node),
        seeds,
      ) &&
      exact(
        facts.predicates.map((row) => row.node),
        predicates,
      )
    )
  ) {
    throw new Error("native SQL seed or predicate coverage is missing or foreign");
  }
  const reached = new Set<number>();
  const walk = (index: number, ceiling: number): void => {
    const value = facts.terms[index];
    if (value === undefined || index >= ceiling) {
      throw new Error("native SQL predicate term is missing, cyclic or foreign");
    }
    reached.add(index);
    if (value.kind === "and" || value.kind === "or" || value.kind === "choice") {
      for (const child of value.terms) {
        walk(child, index);
      }
    } else if (value.kind === "leaf" && new Set(value.bindings.map(([parameter]) => key(parameter))).size !== value.bindings.length) {
      throw new Error("native SQL predicate bindings are ambiguous");
    }
  };
  for (const row of facts.predicates) {
    walk(row.root, facts.terms.length);
  }
  if (reached.size !== facts.terms.length) {
    throw new Error("native SQL predicate terms exceed the registered roots");
  }
}
