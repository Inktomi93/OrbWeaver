// Pin inputs retain their importing capture even when the operand is supplied through another source.
import type { CallExpression, Node, SourceFile } from "ts-morph";
import type { NativeDrizzleSqlFacts } from "../../floor/code-facts/drizzle-sql-facts-contract.ts";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import type { ReadAnchor, TenancyPinPass } from "../contract/tenancy.ts";
import { requiredInvocationFact } from "./native-invocation.ts";
import { drizzleSchemaIdentityFact } from "./schema-fact.ts";

/** Preparation registers only original anchors and their existing observation context. */
export function nativeTenancyPins(
  ctx: Pick<GatePolicyContext, "nativeTypes" | "fact">,
  anchors: readonly ReadAnchor[],
  calls: readonly CallExpression[],
  references: readonly Node[],
): TenancyPinPass {
  let plan: InventoryInvocationPlan | undefined;
  let files: readonly SourceFile[] = [];
  const native = (): NonNullable<GatePolicyContext["nativeTypes"]> => {
    if (ctx.nativeTypes === undefined) {
      throw new Error("native tenancy pin context is unavailable");
    }
    return ctx.nativeTypes;
  };
  const evidenceOf = (node: Node): NativeInvocationEvidence => {
    if (plan === undefined) {
      throw new Error("native tenancy pin inputs were not prepared");
    }
    const delivered = [...new Set(native().invocationEvidence(files, plan).values())];
    const matches = delivered.filter((fact) => fact.typeObservations?.nodes.some((row) => row.node === node) === true);
    const selected = matches[0];
    if (matches.length !== 1 || selected?.typeObservations === undefined) {
      throw new Error("native tenancy pin operand has no unique registered importing context");
    }
    selected.typeObservations.assertNode(node);
    return selected;
  };
  const sqlOf = (node: Node, facet: keyof NativeDrizzleSqlFacts): NativeDrizzleSqlFacts => {
    if (plan === undefined) {
      throw new Error("native tenancy SQL inputs were not prepared");
    }
    const delivered = [...new Set(native().invocationEvidence(files, plan).values())];
    if (delivered.some((fact) => fact.drizzleSql === undefined)) {
      throw new Error("native tenancy SQL facts are unavailable");
    }
    const matches = delivered.filter((fact) => fact.drizzleSql?.[facet].has(node) === true);
    const selected = matches[0];
    if (matches.length !== 1 || selected?.drizzleSql === undefined || selected.typeObservations === undefined) {
      throw new Error("native tenancy SQL input has no unique registered importing context");
    }
    selected.typeObservations.assertNode(node);
    return selected.drizzleSql;
  };
  return {
    sql: {
      statement: (node) => requiredInvocationFact(sqlOf(node, "statements").statements, node),
      predicate: (node) => requiredInvocationFact(sqlOf(node, "predicates").predicates, node),
      consumers: (node) => requiredInvocationFact(sqlOf(node, "consumers").consumers, node),
    },
    prepare: (): void => {
      const seeds = [...new Set(anchors.map((anchor) => anchor.call))];
      if (seeds.length === 0) {
        return;
      }
      files = [...new Set([...seeds, ...calls, ...references].map((node) => node.getSourceFile()))];
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand(
          {
            profile: TYPE_OBSERVATION_PROFILE,
            sources: files,
            nodes: [],
            questions: [
              {
                kind: "drizzle-predicate-inputs",
                nodes: seeds,
                predicateContext: { calls, references },
                valueFacets: ["drizzle-value-sources"],
              },
            ],
          },
          (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
        ),
      };
      native().request({ kind: "invocation-evidence", nodes: files, plan });
    },
    assertSchema: (index): void => {
      const schema = ctx.fact(drizzleSchemaIdentityFact);
      if (schema.status !== "ready") {
        throw new Error(`native tenancy pin schema is ${schema.status}`);
      }
      const tables = schema.value.tables;
      if (
        tables.length !== index.idents.size ||
        tables.length !== index.identBySqlName.size ||
        tables.some((table) => !index.idents.has(table.identity.declarationName) || index.identBySqlName.get(table.sqlName) !== table.identity.declarationName)
      ) {
        throw new Error("native tenancy pin schema and consumer table index disagree");
      }
    },
    sourceEvidence: (node): ReturnType<TenancyPinPass["sourceEvidence"]> => {
      const facts = evidenceOf(node);
      if (facts.drizzleValueSources === undefined) {
        throw new Error("native tenancy pin value-source facts are unavailable");
      }
      return requiredInvocationFact(facts.drizzleValueSources, node);
    },
    typeObservations: (node): ReturnType<TenancyPinPass["typeObservations"]> => {
      const facts = evidenceOf(node).typeObservations;
      if (facts === undefined) {
        throw new Error("native tenancy pin Type facts are unavailable");
      }
      return readTypeObservations(facts);
    },
  };
}
