// Native reader identity belongs to the importing source even when related syntax lives elsewhere.
import type { ImportDeclaration, Node, SourceFile } from "ts-morph";
import type { CallableDeclaration, ModuleMemberOrigin, ReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import type { TypeObservationQuestion, TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
export interface BrowserContractRead {
  readonly types: TypeObservationReader;
  readonly module: (node: Node) => ReferenceFact<ModuleMemberOrigin>;
  readonly moduleSource: (node: ImportDeclaration) => SourceFile | undefined;
}

export interface CtMountRead extends Pick<BrowserContractRead, "types" | "module"> {
  readonly stable: (node: Node) => ReferenceFact<Node>;
  readonly composite: (node: Node) => ReferenceFact<Node>;
  readonly scalar: (node: Node) => ReferenceFact<import("../../floor/code-facts/static-authored-value-contract.ts").StaticAuthoredScalar>;
  readonly lexical: (node: Node) => Node | undefined;
  readonly writes: (node: Node) => ReferenceFact<true>;
  readonly callable: (node: Node) => ReferenceFact<CallableDeclaration>;
  readonly exports: (source: SourceFile, name: string) => readonly Node[] | null;
}

export interface BrowserMountNativeRead<Value> {
  readonly prepare: () => void;
  readonly at: (source: SourceFile) => Value;
}

export interface CtMountNativeDemand {
  readonly exports: ReadonlyMap<string, readonly string[]>;
  readonly composeRoot: string;
  readonly callableHomes: NonNullable<TypeObservationQuestion["callableHomes"]>;
}
