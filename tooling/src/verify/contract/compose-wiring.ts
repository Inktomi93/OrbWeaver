// The native-world questions compose-wiring-only asks: nominated during the walk, answered after seal.
import type { CallExpression, Identifier, Node } from "ts-morph";
import type {
  CallableDeclaration,
  GlobalMemberOrigin,
  MemberReference,
  ModuleMemberOrigin,
  ReferenceFact,
} from "../../floor/code-facts/reference-fact-contract.ts";

/** Exact syntax nominated before seal; each question names the native family that answers it. */
export interface ComposeReadDemand {
  readonly callable: (node: Node) => void;
  readonly globalOrigin: (node: Node) => void;
  readonly moduleOrigin: (node: Node) => void;
  readonly calledMember: (call: CallExpression) => void;
  readonly computedName: (key: Node) => void;
  readonly binding: (identifier: Identifier) => void;
  readonly writes: (identifier: Identifier) => void;
  readonly stable: (node: Node) => void;
  readonly staticString: (node: Node) => void;
}

/** Sealed answers in the importing native world. A question the walk did not nominate refuses as unsupported. */
export interface ComposeReads {
  readonly callable: (node: Node) => ReferenceFact<CallableDeclaration>;
  readonly globalOrigin: (node: Node) => ReferenceFact<GlobalMemberOrigin>;
  readonly moduleOrigin: (node: Node) => ReferenceFact<ModuleMemberOrigin>;
  readonly calledMember: (call: CallExpression) => ReferenceFact<readonly Node[]>;
  readonly member: (node: Node) => ReferenceFact<MemberReference>;
  readonly binding: (node: Node) => ReferenceFact<Node>;
  readonly writes: (identifier: Identifier) => ReferenceFact<true>;
  readonly symbolMember: (access: Node) => ReferenceFact<Node>;
}

export interface ComposeNativeReads {
  readonly demand: ComposeReadDemand;
  readonly prepare: () => void;
  readonly reads: () => ComposeReads;
}
