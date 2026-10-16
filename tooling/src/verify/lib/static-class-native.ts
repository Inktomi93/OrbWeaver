// Closed CSS questions use the existing native capture; the evaluator retains every CSS judgment.
import type { Node as MorphNode } from "ts-morph";
import { Node, VariableDeclarationKind } from "ts-morph";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import type { GateFactContext } from "../contract/fact.ts";
import type { StaticClassNativeContext, StaticClassNativeRead } from "../contract/static-class-expression.ts";
import { STATIC_CLASS_TRIM_METHODS } from "../contract/static-class-expression.ts";
import { unwrapExpression } from "./ast-read.ts";
import { selectorWriterValueNominees } from "./css-selector-writers.ts";

function attributeValue(node: import("ts-morph").JsxAttribute): MorphNode | undefined {
  const initial = node.getInitializer();
  return Node.isJsxExpression(initial) ? initial.getExpression() : initial;
}
function valueNominees(node: MorphNode): readonly MorphNode[] {
  if (Node.isJsxAttribute(node) && node.getNameNode().getText() === "style") {
    const value = attributeValue(node);
    return value === undefined ? [] : [value];
  }
  if (Node.isJsxSpreadAttribute(node)) {
    return [node.getExpression()];
  }
  if (Node.isPropertyAssignment(node)) {
    const name = node.getNameNode();
    if (Node.isComputedPropertyName(name)) {
      return [name.getExpression()];
    }
    const value = node.getInitializer();
    return name.getText().replace(/^["']|["']$/gu, "") === "properties" && value !== undefined ? [value] : [];
  }
  const access = writerAccess(node);
  if (access === undefined) {
    return [];
  }
  const argument = Node.isElementAccessExpression(access) ? access.getArgumentExpression() : undefined;
  return argument === undefined ? [] : [argument];
}
function profileNominees(node: MorphNode, writers: boolean): readonly MorphNode[] {
  const style = Node.isJsxSpreadAttribute(node) || (Node.isJsxAttribute(node) && node.getNameNode().getText() === "style");
  return style !== writers ? valueNominees(node) : [];
}
function writerAccess(node: MorphNode): MorphNode | undefined {
  if (Node.isCallExpression(node)) {
    return node.getExpression();
  }
  return Node.isBinaryExpression(node) ? unwrapExpression(node.getLeft()) : undefined;
}
function receiver(node: MorphNode): readonly MorphNode[] {
  const access = writerAccess(node);
  return Node.isPropertyAccessExpression(access) || Node.isElementAccessExpression(access) ? [access.getExpression()] : [];
}
function rootNominee(node: MorphNode): boolean {
  return !Node.isIdentifier(node);
}
export function nativeStaticClassRead(context: GateFactContext, nominees: () => readonly MorphNode[], writers = false): StaticClassNativeRead {
  const native = context.nativeTypes;
  if (native === undefined) {
    throw new Error("native static-class facts are unavailable");
  }
  let plan: InventoryInvocationPlan | undefined;
  let delivered: ReadonlyMap<MorphNode, NativeInvocationEvidence> | undefined;
  const readers = new Map<NativeInvocationEvidence, TypeObservationReader>();
  return {
    prepare: (): void => {
      const nodes = nominees();
      const unique = (values: readonly MorphNode[]): MorphNode[] => [...new Set(values)].filter((value) => !Node.isOmittedExpression(value));
      const sources = context.files;
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand(
          {
            profile: TYPE_OBSERVATION_PROFILE,
            sources,
            nodes: [],
            questions: [
              {
                kind: "declaration-closure",
                nodes: unique(nodes.filter(rootNominee)),
                files: sources.map((source) => source.getFilePath().replaceAll("\\", "/")),
                valueFacets: ["stable"],
                receiverMethods: STATIC_CLASS_TRIM_METHODS,
              },

              ...(writers
                ? [
                    { kind: "property-symbols" as const, nodes: unique(nodes.flatMap(receiver)), properties: ["className", "setAttribute"] },
                    { kind: "literal-values" as const, nodes: unique(nodes.flatMap(selectorWriterValueNominees)) },
                  ]
                : []),

              {
                kind: "value-profiles",
                nodes: unique(nodes.flatMap((node) => profileNominees(node, writers))),
                valueFacets: writers ? ["stable", "string"] : ["authored-value"],
              },
            ],
          },
          (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
        ),
      };
      native.request({ kind: "invocation-evidence", nodes: sources, plan });
      for (const importer of sources) {
        const bindings = nodes.filter((node) => {
          const parent = node.getParent();
          return (
            Node.isIdentifier(node) &&
            node.getSourceFile() === importer &&
            Node.isVariableDeclaration(parent) &&
            parent.getNameNode() === node &&
            parent.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const
          );
        });
        if (bindings.length > 0) {
          native.request({ kind: "references", nodes: bindings, importer });
        }
      }
    },
    at: (source): StaticClassNativeContext => {
      if (plan === undefined) {
        throw new Error("native static-class demand was not prepared");
      }
      delivered ??= native.invocationEvidence(context.files, plan);
      const evidence = delivered.get(source);
      if (evidence?.typeObservations === undefined) {
        throw new Error("static-class source has no native importing owner");
      }
      const facts = evidence.typeObservations;
      facts.assertNode(source);
      let types = readers.get(evidence);
      if (types === undefined) {
        types = readTypeObservations(evidence.typeObservations);
        readers.set(evidence, types);
      }
      return {
        types,
        evidence,
        references: (node): readonly MorphNode[] => {
          facts.assertNode(node);
          const values = native.references([node], source).get(node);
          if (values === undefined) {
            throw new Error("native static-class reference answer is missing");
          }
          return values;
        },
      };
    },
  };
}
