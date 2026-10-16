// Predicate inputs and SQL facts share one complete native call/reference context.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { observeCallReturns } from "../code-facts/call-returns.ts";
import { callsDrizzleOperator } from "../code-facts/drizzle-operators.ts";
import { readDrizzlePredicate } from "../code-facts/drizzle-predicate.ts";
import { readPredicateArgument } from "../code-facts/drizzle-predicate-argument.ts";
import type { DrizzlePredicate } from "../code-facts/drizzle-predicate-contract.ts";
import { readAnchorOf, readRelationalConfigProperty, readRelationalWhere } from "../code-facts/drizzle-query.ts";
import type { ReadAnchor } from "../code-facts/drizzle-query-contract.ts";
import type { CapturedDrizzleSqlFacts } from "../code-facts/drizzle-sql-facts-contract.ts";
import { readPredicateConsumers, readStatementOf } from "../code-facts/drizzle-statement.ts";
import { unwrapExpression } from "../code-facts/expression-value.ts";
import type { TypeObservationCaptureOwner, TypeObservationDemand } from "../code-facts/type-observations-contract.ts";

/** Each nominated root retains the observations of its own supplied importing context. */
export function captureDrizzleSqlInputs(demand: TypeObservationDemand, facts: CapturedDrizzleSqlFacts): TypeObservationCaptureOwner["predicateInputs"] {
  const questions = demand.questions?.filter((value) => value.kind === "drizzle-predicate-inputs") ?? [];
  if (questions.length === 0) {
    return;
  }
  const contexts = questions.map((question) => {
    const context = question.predicateContext;
    if (context === undefined) {
      throw new Error("native predicate-input demand has no explicit call/reference context");
    }
    const calls = context.calls.map((node) => {
      if (!Node.isCallExpression(node)) {
        throw new Error("native predicate-input context contains a non-call");
      }
      return node;
    });
    return { question, observations: observeCallReturns(calls, context.references, { suppliedCallableTargets: true }) };
  });
  const predicateContexts = new Map<MorphNode, object>();
  return (node) => {
    const selected = contexts.filter(({ question }) => question.nodes.includes(node));
    const context = selected[0];
    if (selected.length !== 1 || context === undefined) {
      throw new Error("native predicate-input root has no unique registered context");
    }
    const anchor = readAnchorOf(node);
    if (anchor === undefined) {
      throw new Error("native predicate-input seed has no canonical read anchor");
    }
    const statement = readStatementOf(node, context.observations);
    facts.statements.set(node, statement);
    facts.consumers.set(node, readPredicateConsumers(node, context.observations));
    const predicates = predicateRoots(anchor, statement);
    for (const predicate of predicates) {
      const prior = predicateContexts.get(predicate);
      if (prior !== undefined && prior !== context) {
        throw new Error("native SQL predicate belongs to distinct supplied contexts");
      }
      predicateContexts.set(predicate, context);
      if (!facts.predicates.has(predicate)) {
        facts.predicates.set(predicate, readDrizzlePredicate(predicate, context.observations));
      }
    }
    return {
      predicates,
      values: [
        ...new Set(
          predicates.flatMap((predicate) => {
            const fact = facts.predicates.get(predicate);
            if (fact === undefined) {
              throw new Error("native SQL predicate was not captured");
            }
            return predicateValueInputs(fact);
          }),
        ),
      ],
    };
  };
}

function predicateRoots(anchor: ReadAnchor, statement: ReturnType<typeof readStatementOf>): readonly MorphNode[] {
  if (anchor.kind === "relational") {
    const config = anchor.config === undefined ? undefined : unwrapExpression(anchor.config);
    const where = readRelationalWhere(readRelationalConfigProperty(config, "where"), anchor.table.getText());
    return where?.predicate === undefined ? [] : [where.predicate];
  }
  const own = anchor.kind === "join" && anchor.on !== undefined ? [anchor.on] : [];
  return [...new Set([...own, ...statement.innerOns, ...statement.wheres])];
}

function predicateValueInputs(fact: DrizzlePredicate): readonly MorphNode[] {
  if (fact.kind === "and" || fact.kind === "or" || fact.kind === "choice") {
    return fact.terms.flatMap(predicateValueInputs);
  }
  if (fact.kind !== "leaf" || !Node.isCallExpression(fact.node) || !(callsDrizzleOperator(fact.node, "eq") || callsDrizzleOperator(fact.node, "inArray"))) {
    return [];
  }
  return fact.node
    .getArguments()
    .slice(0, 2)
    .flatMap((argument) => {
      const actual = readPredicateArgument(argument, fact.bindings);
      return actual.kind === "resolved" ? [actual.value] : [];
    });
}
