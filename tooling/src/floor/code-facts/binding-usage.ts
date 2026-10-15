import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { DeclarationBindingKeys, SourceBindingReaders, SourceBindingUsage } from "./binding-usage-contract.ts";
import { isDocumentationLinkReference } from "./reference-documentation.ts";

function collectParents(source: SourceFile, read: (node: Node) => DeclarationBindingKeys, declarationKey: (node: Node) => string): Map<string, Set<string>> {
  const built = new Map<string, Set<string>>();
  for (const identifier of source.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (isDocumentationLinkReference(identifier) || identifier.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) !== undefined) {
      continue;
    }
    const parent = declarationKey(identifier.getParent());
    for (const origin of read(identifier).origins) {
      const sites = built.get(origin) ?? new Set<string>();
      sites.add(parent);
      built.set(origin, sites);
    }
  }
  return built;
}

/** Build demanded-source facts once; every access must still admit the source and its compiler context. */
export function createSourceBindingUsage(source: SourceFile, readers: SourceBindingReaders): SourceBindingUsage {
  let admitted: SourceFile | undefined = source;
  let admit: ((node: Node) => void) | undefined = readers.admit;
  const readBindings = readers.bindings;
  const declarationKey = readers.declarationKey;
  const queryNode = readers.queryNode;
  const bindings = new Map<string, DeclarationBindingKeys>();
  let parents: Map<string, Set<string>> | undefined;
  const read = (node: Node): DeclarationBindingKeys => {
    if (admit === undefined) {
      throw new Error("source binding usage has been disposed");
    }
    const query = queryNode?.(node) ?? node;
    const key = `${String(query.getStart())}:${String(query.getEnd())}:${String(query.getKind())}`;
    let value = bindings.get(key);
    if (value === undefined) {
      value = readBindings(query);
      bindings.set(key, value);
    }
    return value;
  };
  return {
    lexical: (node): readonly string[] => {
      if (admit === undefined) {
        throw new Error("source binding usage has been disposed");
      }
      admit(node);
      return read(node).lexical;
    },
    parents: (): ReadonlyMap<string, ReadonlySet<string>> => {
      if (admitted === undefined || admit === undefined) {
        throw new Error("source binding usage has been disposed");
      }
      admit(admitted);
      if (parents === undefined) {
        const built = collectParents(admitted, read, declarationKey);
        admit(admitted);
        parents = built;
      }
      return parents;
    },
    [Symbol.dispose]: (): void => {
      admitted = undefined;
      admit = undefined;
      bindings.clear();
      parents?.clear();
    },
  };
}
