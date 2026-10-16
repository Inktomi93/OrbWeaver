import type { Node } from "ts-morph";
import type { CallableDeclaration, MemberReference, ReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import type { SchemaBuilderReadServices } from "../../floor/code-facts/schema-model-contract.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";

export const TRPC_OUTPUT_ROOT = { path: "packages/server/src/transport/trpc/router.ts", name: "appRouter" } as const;
export const TRPC_OUTPUT_CHAIN_METHODS = ["input", "output", "use", "meta"] as const;
export const TRPC_OUTPUT_METHODS = ["router", "procedure", ...TRPC_OUTPUT_CHAIN_METHODS, "query", "mutation"] as const;

export interface TrpcOutputRead {
  readonly root: readonly Node[] | null;
  readonly admittedSources: ReadonlySet<object>;
  readonly types: TypeObservationReader;
  readonly builder: SchemaBuilderReadServices;
  readonly member: (node: Node) => ReferenceFact<MemberReference>;
  readonly callable: (node: Node) => ReferenceFact<CallableDeclaration>;
}
export interface TrpcOutputNativeRead {
  readonly prepare: () => void;
  readonly read: () => TrpcOutputRead;
}
