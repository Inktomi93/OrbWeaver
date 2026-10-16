// Shared module conversion preserves source ownership and never asks a replay node for meaning.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { InventoryModuleOrigin } from "./module-origin-inventory-contract.ts";
import type { ModuleMemberOrigin } from "./reference-fact-contract.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";

/** Original module and canonical home remain distinct on the wire. */
export function encodeModuleOrigin(value: ModuleMemberOrigin, span: (node: MorphNode) => InventorySpan): InventoryModuleOrigin {
  return {
    ...value,
    memberPath: [...value.memberPath],
    declaration: span(value.declaration),
    canonical:
      value.canonical.kind === "project"
        ? { ...value.canonical, sourceFile: span(value.canonical.sourceFile), declaration: span(value.canonical.declaration) }
        : { ...value.canonical, declaration: span(value.canonical.declaration) },
  };
}

/** A project declaration must replay in its captured source, not merely at a matching spelling. */
export function replayModuleOrigin(value: InventoryModuleOrigin, replay: (span: InventorySpan) => MorphNode): ModuleMemberOrigin {
  const canonical = value.canonical;
  if (canonical.kind === "external-door") {
    return { ...value, declaration: replay(value.declaration), canonical: { ...canonical, declaration: replay(canonical.declaration) } };
  }
  const sourceFile = replay(canonical.sourceFile);
  if (!Node.isSourceFile(sourceFile)) {
    throw new SemanticInventoryError("native invocation module source is not a SourceFile");
  }
  const declaration = replay(canonical.declaration);
  if (declaration.getSourceFile() !== sourceFile) {
    throw new SemanticInventoryError("native invocation canonical declaration has a foreign source");
  }
  return { ...value, declaration: replay(value.declaration), canonical: { ...canonical, sourceFile, declaration } };
}
