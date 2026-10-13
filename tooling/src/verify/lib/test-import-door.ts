// Forbidden authored test doors; sibling policies retain their distinct authority and report identities.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { modulePositionSpecifier, rawPackageReach, relativeClimb } from "../../floor/code-facts/module-specifier.ts";
import type { TestImportDoor } from "../contract/test-import-door.ts";

/** Classify a module-position spelling that bypasses a package or testkit public door. */
export function testImportDoor(node: MorphNode, importer: string): TestImportDoor | undefined {
  const literal = modulePositionSpecifier(node);
  if (literal === undefined || !Node.isStringLiteral(literal)) {
    return;
  }
  const specifier = literal.getLiteralValue();
  const relative = relativeClimb(importer, specifier);
  if (relative !== undefined) {
    return relative.kind === "testkit"
      ? { kind: "relative-testkit", literal, door: relative.door }
      : { kind: "relative-package", literal, pkg: relative.pkg, path: relative.path };
  }
  const raw = rawPackageReach(specifier);
  return raw === undefined ? undefined : { kind: "raw-package", literal, pkg: raw.pkg, path: raw.path };
}
