// The declaration node a declaration key names, found by its span in its file. It sits below the builder and the
// find-references check alike, so both read it without importing each other.
import type { Node, SourceFile, SyntaxKind } from "@typescript/native/ast";
import type { NativeWorld } from "../native.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts } from "./resolve.ts";
import { declarationNameOf } from "./sites.ts";

/** The name node of the declaration a key names, found by its span in its file. */
export function declaredNameOf(world: NativeWorld, key: DeclKey): Node | undefined {
  const { file, pos, end, kind } = declKeyParts(key);
  const source = world.source(file);
  const node = source === undefined ? undefined : nodeAt(source, { pos, end, kind });
  return node === undefined ? undefined : declarationNameOf(node);
}

/** The node of `kind` that spans exactly `pos` to `end` in `source`. */
export function nodeAt(source: SourceFile, { pos, end, kind }: { readonly pos: number; readonly end: number; readonly kind: SyntaxKind }): Node | undefined {
  let found: Node | undefined;
  const visit = (node: Node): void => {
    if (found !== undefined || node.pos > pos || node.end < end) {
      return;
    }
    if (node.pos === pos && node.end === end && node.kind === kind) {
      found = node;
      return;
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}
