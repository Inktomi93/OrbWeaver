// Each root keeps its importing capture while related declarations retain their authored spans.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { projectAuthoredScalar } from "../../floor/code-facts/static-authored-value.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import { typeProjectionFacet } from "../../floor/code-facts/type-projection-contract.ts";
import { inventoryQueryNode } from "../../floor/compiler/drizzle-inventory-extract.ts";
import type { BrowserContractRead, BrowserMountNativeRead, CtMountNativeDemand, CtMountRead } from "../contract/browser-mount-native.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { isCtMountRoot } from "./ct-mount-admission.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

export function nativeBrowserContractRead(context: GatePolicyContext, nominees: () => readonly MorphNode[]): BrowserMountNativeRead<BrowserContractRead> {
  const native = context.nativeTypes;
  if (native === undefined) {
    throw new Error("native browser-contract facts are unavailable");
  }
  let plan: InventoryInvocationPlan | undefined;
  let evidence: ReadonlyMap<MorphNode, NativeInvocationEvidence> | undefined;
  const readers = new Map<NativeInvocationEvidence, TypeObservationReader>();
  let sources: readonly SourceFile[] = [];
  return {
    prepare: (): void => {
      const nodes = [...new Set(nominees())];
      sources = [...new Set(nodes.map((node) => node.getSourceFile()))];
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand(
          {
            profile: TYPE_OBSERVATION_PROFILE,
            sources,
            nodes: [],
            questions: [{ kind: "browser-contracts", nodes, valueFacets: ["module"] }],
          },
          (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
        ),
      };
      native.request({ kind: "invocation-evidence", nodes: sources, plan });
      for (const importer of sources) {
        native.request({ kind: "module-targets", nodes: importer.getImportDeclarations(), importer });
      }
    },
    at: (source): BrowserContractRead => {
      if (plan === undefined) {
        throw new Error("native browser-contract demand was not prepared");
      }
      evidence ??= native.invocationEvidence(sources, plan);
      const delivered = requiredInvocationFact(evidence, source);
      if (delivered.typeObservations === undefined) {
        throw new Error("browser-contract source has no native importing owner");
      }
      delivered.typeObservations.assertNode(source);
      const assertNode = delivered.typeObservations.assertNode;
      const fact = <Value>(facts: ReadonlyMap<MorphNode, Value>, node: MorphNode): Value => {
        assertNode(node);
        return requiredInvocationFact(facts, node);
      };
      let types = readers.get(delivered);
      if (types === undefined) {
        types = readTypeObservations(delivered.typeObservations);
        readers.set(delivered, types);
      }
      return {
        types,
        module: (node) => fact(delivered.modules, node),
        moduleSource: (node) => native.moduleTargets([node], source).get(node),
      };
    },
  };
}

const CLOSED_REGISTRY_ARITY = 3;
const REGISTRY_ARITIES = new Set([2, CLOSED_REGISTRY_ARITY]);
export function nativeCtMountRead(
  context: GatePolicyContext,
  nominees: () => readonly MorphNode[],
  demand: CtMountNativeDemand,
): BrowserMountNativeRead<CtMountRead> {
  const native = context.nativeTypes;
  if (native === undefined) {
    throw new Error("native CT mounting facts are unavailable");
  }
  let plan: InventoryInvocationPlan | undefined;
  let evidence: ReadonlyMap<MorphNode, NativeInvocationEvidence> | undefined;
  const readers = new Map<NativeInvocationEvidence, TypeObservationReader>();
  let callableNodes: readonly MorphNode[] = [];
  return {
    prepare: (): void => {
      const roots = [...new Set(nominees())];
      const nodes = [...new Set(roots.flatMap((node) => [node, ...node.getDescendants()]))];
      const calls = nodes.filter(Node.isCallExpression);
      callableNodes = [
        ...new Set(
          nodes.flatMap((node) => {
            if (Node.isCallExpression(node)) {
              return [node, ...node.getArguments().slice(0, 1)];
            }
            return Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node) ? [node.getTagNameNode()] : [];
          }),
        ),
      ];
      const mountCallees = calls
        .filter((call) => isCtMountRoot(context.relativePath(call.getSourceFile())))
        .flatMap((call) => {
          const callee = call.getExpression();
          return Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee) ? [callee, callee.getExpression()] : [callee];
        });
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeProjection: { facets: ["lexical"], properties: [] },
        typeObservations: mapTypeObservationDemand(
          {
            profile: TYPE_OBSERVATION_PROFILE,
            sources: context.files,
            nodes: [],
            questions: [
              {
                kind: "ct-mounting",
                nodes: roots,
                valueFacets: ["module", "stable", "authored-value", "reference-writes", "authored-composite", "type-projection"],
              },
              { kind: "mount-signatures", nodes: [...new Set(mountCallees)] },
              {
                kind: "ct-contributions",
                nodes: calls.filter((call) => REGISTRY_ARITIES.has(call.getArguments().length)),
                relationTargets: calls
                  .filter(
                    (call) =>
                      REGISTRY_ARITIES.has(call.getArguments().length) && context.relativePath(call.getSourceFile()).startsWith(`${demand.composeRoot}/`),
                  )
                  .map((call) => ({
                    file: call.getSourceFile().getFilePath().replaceAll("\\", "/"),
                    start: call.getStart(),
                    end: call.getEnd(),
                    kind: call.getKind(),
                  })),
                callableHomes: demand.callableHomes,
                valueFacets: ["module"],
              },
            ],
          },
          (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
        ),
      };
      native.request({ kind: "invocation-evidence", nodes: context.files, plan });
      native.request({ kind: "callable-declarations", nodes: callableNodes });
      for (const [path, names] of demand.exports) {
        const source = context.files.find((file) => context.relativePath(file) === path);
        if (source !== undefined) {
          for (const name of names) {
            native.request({ kind: "export-declarations", nodes: [source], name });
          }
        }
      }
    },
    at: (source): CtMountRead => {
      if (plan === undefined) {
        throw new Error("native CT mounting demand was not prepared");
      }
      evidence ??= native.invocationEvidence(context.files, plan);
      const delivered = requiredInvocationFact(evidence, source);
      if (delivered.typeObservations === undefined) {
        throw new Error("CT source has no native importing owner");
      }
      delivered.typeObservations.assertNode(source);
      const assertNode = delivered.typeObservations.assertNode;
      const fact = <Value>(facts: ReadonlyMap<MorphNode, Value>, node: MorphNode): Value => {
        assertNode(node);
        return requiredInvocationFact(facts, node);
      };
      let types = readers.get(delivered);
      if (types === undefined) {
        types = readTypeObservations(
          delivered.typeObservations,
          undefined,
          (node) => fact(delivered.modules, node),
          (span) =>
            inventoryQueryNode(
              context.files.find((file) => file.getFilePath().replaceAll("\\", "/") === span.file),
              span,
            ),
        );
        readers.set(delivered, types);
      }
      const read = types;
      return {
        types: read,
        module: (node) => fact(delivered.modules, node),
        stable: (node) => fact(delivered.stableValues, node),
        composite: (node): ReturnType<CtMountRead["composite"]> => {
          if (delivered.authoredComposites === undefined) {
            throw new Error("native authored-composite facts unavailable");
          }
          return fact(delivered.authoredComposites, node);
        },
        scalar: (node) => projectAuthoredScalar(fact(delivered.authoredValues, node).value),
        writes: (node): ReturnType<CtMountRead["writes"]> => {
          if (delivered.referenceWrites === undefined) {
            throw new Error("native reference-write facts unavailable");
          }
          return fact(delivered.referenceWrites, node);
        },
        lexical: (node): MorphNode | undefined => {
          const lexical = typeProjectionFacet(fact(delivered.typeProjections, node), "lexical").value;
          return lexical.kind === "resolved" ? lexical.value : undefined;
        },
        callable: (node) => requiredInvocationFact(native.callableDeclarations([node]), node),
        exports: (file, name): readonly MorphNode[] | null => {
          const result = native.exportDeclarations([file], name).get(file);
          if (result === undefined) {
            throw new Error("native CT export answer missing");
          }
          return result;
        },
      };
    },
  };
}
