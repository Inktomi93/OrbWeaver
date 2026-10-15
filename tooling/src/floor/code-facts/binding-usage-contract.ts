import type { Node } from "ts-morph";

export interface DeclarationBindingKeys {
  readonly lexical: readonly string[];
  readonly origins: readonly string[];
}

/** Source/context-owned binding facts, not an alive/dead judgment. */
export interface SourceBindingUsage extends Disposable {
  readonly lexical: (node: Node) => readonly string[];
  readonly parents: () => ReadonlyMap<string, ReadonlySet<string>>;
}

export interface SourceBindingReaders {
  readonly bindings: (node: Node) => DeclarationBindingKeys;
  readonly declarationKey: (node: Node) => string;
  readonly admit: (node: Node) => void;
  readonly queryNode?: (node: Node) => Node;
}
