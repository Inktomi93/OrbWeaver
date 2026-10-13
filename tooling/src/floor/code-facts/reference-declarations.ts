// Declaration-name selection over an admitted corpus; native exports or pinned inventory exports own identity.
import type { ExportGetableNode, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { inventoryDeclarationKey, inventoryExports, semanticInventoryOf } from "./semantic-inventory-reader.ts";

/** Every exported (workspace-wide) or module-local (same-file refs still matter) declaration named `name`,
 *  over the SCANNED corpus (the caller's `scanCorpus` result — never a second walk of the project). */
export function declarationsNamed(files: readonly SourceFile[], name: string): Node[] {
  // Dedupe by node identity: `getExportedDeclarations()` resolves THROUGH re-exports, so every barrel
  // that re-exports a shape returns the SAME origin node — without this, a barreled symbol counts one
  // "declaration" per barrel (false one-home alarm) and refs run/push once per duplicate (inflated hits).
  const candidates: Node[] = [];
  for (const sf of files) {
    const exports = inventoryExports(sf);
    const stored = semanticInventoryOf(sf.getProject());
    const exportedKeys = new Set([...exports.values()].flatMap((nodes) => nodes.map(inventoryDeclarationKey)));
    const isLocal = (node: Node & ExportGetableNode): boolean =>
      stored === undefined ? !node.isExported() : !(node.hasExportKeyword() || exportedKeys.has(inventoryDeclarationKey(node)));
    candidates.push(...(exports.get(name) ?? []));
    candidates.push(...sf.getFunctions().filter((fn) => fn.getName() === name && isLocal(fn)));
    candidates.push(...sf.getVariableDeclarations().filter((v) => v.getName() === name && isLocal(v)));
    candidates.push(...sf.getClasses().filter((decl) => decl.getName() === name && isLocal(decl)));
    candidates.push(...sf.getInterfaces().filter((decl) => decl.getName() === name && isLocal(decl)));
    candidates.push(...sf.getTypeAliases().filter((decl) => decl.getName() === name && isLocal(decl)));
    candidates.push(...sf.getEnums().filter((decl) => decl.getName() === name && isLocal(decl)));
    candidates.push(...sf.getDescendantsOfKind(SyntaxKind.MethodDeclaration).filter((decl) => decl.getName() === name));
  }
  const seen = new Set<string>();
  return candidates.filter((node) => {
    const key = inventoryDeclarationKey(node);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
