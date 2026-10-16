// Bus providers share acquisition, not populations or policy judgments.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { readMemberReferenceWithName } from "../../floor/code-facts/reference-fact.ts";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { projectAuthoredScalar } from "../../floor/code-facts/static-authored-value.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import type { TypeObservationDemand, TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE, TYPE_OBSERVATION_VALUE_FACETS } from "../../floor/code-facts/type-observations-contract.ts";
import type { BusNativeRead, BusProviderKind, BusReadContext } from "../contract/bus-fact.ts";
import type { GateFactContext } from "../contract/fact.ts";
import { resolveCallableMember } from "./gate-contract-origin.ts";
import { invocationOriginServices, requiredInvocationFact } from "./native-invocation.ts";
import { typeObservationReaders } from "./type-observation-context.ts";

export function busNativeRead(context: GateFactContext, nominees: () => readonly MorphNode[], questions: BusProviderKind): BusNativeRead {
  const native = context.nativeTypes;
  if (native === undefined) {
    throw new Error("native bus facts are unavailable");
  }
  let values: readonly MorphNode[] = [];
  let plan: InventoryInvocationPlan | undefined;
  let types: ReadonlyMap<SourceFile, TypeObservationReader> | undefined;
  let invocations: ReadonlyMap<MorphNode, NativeInvocationEvidence> | undefined;
  const evidenceByReader = new Map<TypeObservationReader, NativeInvocationEvidence>();
  const delivered = (): ReadonlyMap<MorphNode, NativeInvocationEvidence> => {
    if (plan === undefined) {
      throw new Error("native bus demand was not prepared");
    }
    invocations ??= native.invocationEvidence(context.files, plan);
    if (types === undefined) {
      types = typeObservationReaders(invocations);
      for (const [source, reader] of types) {
        const evidence = invocations.get(source);
        if (evidence !== undefined) {
          evidenceByReader.set(reader, evidence);
        }
      }
    }
    return invocations;
  };
  const readContext: BusReadContext = {
    ...context,
    types: (node) => {
      if (plan === undefined) {
        throw new Error("native bus demand was not prepared");
      }
      delivered();
      const reader = types?.get(node.getSourceFile());
      if (reader === undefined) {
        throw new Error("bus source has no native importing owner");
      }
      return reader;
    },
    invocation: (node, reader) => {
      delivered();
      const value = reader === undefined ? invocations?.get(node.getSourceFile()) : evidenceByReader.get(reader);
      if (value === undefined) {
        throw new Error("bus value has no registered native importing owner");
      }
      value.typeObservations?.assertNode(node);
      return value;
    },
    moduleSource: (importer, door) => native.moduleTargets([door], importer).get(door),
  };
  return {
    context: readContext,
    prepare: (): void => {
      const nodes = [...new Set(nominees().flatMap((node) => [node, ...node.getDescendants()]))].filter((node) => !Node.isOmittedExpression(node));
      values = nodes.filter((node) => Node.isExpression(node) || Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node));
      const typed = nodes.filter(
        (node) =>
          Node.isExpression(node) ||
          Node.isTypeNode(node) ||
          Node.isQualifiedName(node) ||
          Node.isTypeAliasDeclaration(node) ||
          Node.isParameterDeclaration(node) ||
          Node.isVariableDeclaration(node) ||
          Node.isPropertySignature(node) ||
          Node.isMethodSignature(node),
      );
      const demand: TypeObservationDemand = {
        profile: TYPE_OBSERVATION_PROFILE,
        sources: context.files,
        nodes: [],
        questions: [
          { kind: "node-types" as const, properties: ["type"], nodes: questions === "payload" ? [] : typed },
          {
            kind: "type-properties" as const,
            properties: ["type"],
            nodes: (questions === "payload" ? [] : nodes)
              .flatMap((node) => (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node) ? [node.getExpression()] : []))
              .filter((node, index, all) => all.indexOf(node) === index),
          },
          {
            kind: "definition-closure" as const,
            nodes: nodes.filter(Node.isIdentifier),
            valueFacets: TYPE_OBSERVATION_VALUE_FACETS,
            files: context.files.map((file) => file.getFilePath().replaceAll("\\", "/")),
          },
          { kind: "call-parameters" as const, properties: ["type"], nodes: (questions === "producer" ? nodes : []).filter(Node.isCallExpression) },
          {
            kind: "signature-parameters" as const,
            properties: ["type"],
            nodes: (questions === "producer" ? nodes : []).filter(
              (node) =>
                (Node.isParameterDeclaration(node) || Node.isPropertySignature(node) || Node.isMethodSignature(node)) &&
                (node.getText().includes("Event") || node.getText().includes("Emitter")),
            ),
          },
          { kind: "value-profiles", nodes: values, valueFacets: TYPE_OBSERVATION_VALUE_FACETS },
          { kind: "symbol-values" as const, properties: ["type"], nodes: (questions === "payload" ? [] : nodes).filter(Node.isIdentifier) },
        ],
      };
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand(demand, (node) => ({
          file: node.getSourceFile().getFilePath().replaceAll("\\", "/"),
          start: node.getStart(),
          end: node.getEnd(),
          kind: node.getKind(),
        })),
      };

      native.request({ kind: "invocation-evidence", nodes: context.files, plan });
      if (questions === "payload") {
        const doors = context.files.flatMap((source) => source.getImportDeclarations());
        for (const importer of context.files) {
          native.request({ kind: "module-targets", nodes: doors, importer });
        }
      }
    },
  };
}

export function busAuthored(
  context: BusReadContext,
  node: MorphNode,
): import("../../floor/code-facts/authored-value-projection.ts").NativeAuthoredValueProjection["value"] {
  return requiredInvocationFact(context.invocation(node).authoredValues, node).value;
}
export function busScalar(context: BusReadContext, node: MorphNode): ReturnType<typeof projectAuthoredScalar> {
  return projectAuthoredScalar(busAuthored(context, node));
}
export function busStable(context: BusReadContext, node: MorphNode): import("../../floor/code-facts/reference-fact-contract.ts").ReferenceFact<MorphNode> {
  return requiredInvocationFact(context.invocation(node).stableValues, node);
}
export function busString(context: BusReadContext, node: MorphNode): import("../../floor/code-facts/reference-fact-contract.ts").ReferenceFact<string> {
  return requiredInvocationFact(context.invocation(node).strings, node);
}
export function busMember(context: BusReadContext, node: MorphNode): ReturnType<typeof readMemberReferenceWithName> {
  return readMemberReferenceWithName(node, context.invocation(node).computedName);
}
export function busCallableMember(context: BusReadContext, node: MorphNode): ReturnType<typeof resolveCallableMember> {
  const evidence = context.invocation(node);
  return resolveCallableMember(node, new Set(), invocationOriginServices(evidence), (value) => requiredInvocationFact(evidence.strings, value));
}

/** Related value syntax retains the question's importing capture, never its physical primary owner. */
export function busReadAt(context: BusReadContext, anchor: MorphNode): BusReadContext {
  const readers = context.types(anchor);
  const evidence = context.invocation(anchor, readers);
  const assertNode = (node: MorphNode): void => {
    if (evidence.typeObservations === undefined) {
      throw new Error("bus capture has no registered type owner");
    }
    evidence.typeObservations.assertNode(node);
  };
  return {
    ...context,
    types: (node): TypeObservationReader => {
      assertNode(node);
      return readers;
    },
    invocation: (node): NativeInvocationEvidence => {
      assertNode(node);
      return evidence;
    },
  };
}
