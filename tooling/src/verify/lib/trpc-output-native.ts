// The mounted root and every related value retain their originating native capture after sealing.
import type { Node as MorphNode } from "ts-morph";
import { readMemberReferenceWithName } from "../../floor/code-facts/reference-fact.ts";
import type { CallableDeclaration, MemberReference, ModuleMemberOrigin, ReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import type { TrpcOutputNativeRead, TrpcOutputRead } from "../contract/trpc-output.ts";
import { TRPC_OUTPUT_METHODS, TRPC_OUTPUT_ROOT } from "../contract/trpc-output.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

export function nativeTrpcOutputRead(context: GatePolicyContext, handlers: () => readonly MorphNode[]): TrpcOutputNativeRead {
  const native = context.nativeTypes;
  if (native === undefined) {
    throw new Error("native tRPC output facts are unavailable");
  }
  const source = context.files.find((file) => context.relativePath(file) === TRPC_OUTPUT_ROOT.path);
  let plan: InventoryInvocationPlan | undefined;
  let result: TrpcOutputRead | undefined;
  let candidates: readonly MorphNode[] = [];
  return {
    prepare: (): void => {
      if (source === undefined) {
        return;
      }
      candidates = [...new Set(handlers())];
      native.request({ kind: "export-declarations", nodes: [source], name: TRPC_OUTPUT_ROOT.name });
      native.request({ kind: "callable-declarations", nodes: candidates });
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand(
          {
            profile: TYPE_OBSERVATION_PROFILE,
            sources: context.files,
            nodes: [],
            questions: [
              {
                kind: "selected-property-graph",
                nodes: [source],
                properties: TRPC_OUTPUT_METHODS,
                valueFacets: ["module", "stable"],
                selectedPropertyGraph: {
                  exportName: TRPC_OUTPUT_ROOT.name,
                  rootPath: ["_def", "record"],
                  stopPath: ["_def"],
                  leafPaths: [
                    ["_def", "type"],
                    ["_def", "$types", "output"],
                  ],
                },
              },
              {
                kind: "callable-body-values",
                nodes: candidates,
                files: context.files.map((file) => file.getFilePath().replaceAll("\\", "/")),
                valueFacets: ["module", "stable"],
              },
            ],
          },
          (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
        ),
      };
      native.request({ kind: "invocation-evidence", nodes: context.files, plan });
    },
    read: (): TrpcOutputRead => {
      if (source === undefined) {
        throw new Error("trpc-output-declarations: AppRouter root is missing from the admitted population");
      }
      if (result !== undefined) {
        return result;
      }
      if (plan === undefined) {
        throw new Error("native tRPC output demand was not prepared");
      }
      const evidence = native.invocationEvidence(context.files, plan).get(source);
      const facts = evidence?.typeObservations;
      if (evidence === undefined || facts === undefined) {
        throw new Error("native tRPC mounted root has no importing owner");
      }
      const types = readTypeObservations(facts);
      const exports = native.exportDeclarations([source], TRPC_OUTPUT_ROOT.name);
      if (!exports.has(source)) {
        throw new Error("native tRPC root export answer is missing");
      }
      const root = exports.get(source) ?? null;
      const captured = types.exportDeclarations(source, TRPC_OUTPUT_ROOT.name);
      if (
        (root === null) !== (captured === null) ||
        root?.length !== captured?.length ||
        root?.some((node, index) => node.compilerNode !== captured?.[index]?.compilerNode) === true
      ) {
        throw new Error("native tRPC root export declarations disagree with their importing capture");
      }
      const callables = native.callableDeclarations(candidates);
      result = {
        root,
        admittedSources: new Set(context.files.map((file) => file.compilerNode)),
        types,
        builder: {
          stable: (node): ReferenceFact<MorphNode> => requiredInvocationFact(evidence.stableValues, node),
          moduleOrigin: (node): ReferenceFact<ModuleMemberOrigin> => requiredInvocationFact(evidence.modules, node),
        },
        member: (node): ReferenceFact<MemberReference> => readMemberReferenceWithName(node, evidence.computedName),
        callable: (node): ReferenceFact<CallableDeclaration> => {
          const fact = callables.get(node);
          if (fact === undefined) {
            throw new Error("native tRPC resolver callable was not nominated");
          }
          const body = types.callableBody(node);
          const expected = fact.kind === "resolved" ? (fact.value.body ?? null) : null;
          if (body?.compilerNode !== expected?.compilerNode) {
            throw new Error("native tRPC callable body disagrees with its importing capture");
          }
          return fact;
        },
      };
      return result;
    },
  };
}
