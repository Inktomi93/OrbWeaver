// One reader for the DOOR a test enters its runner through, plus the structural tell that separates the
// two composed doors. Canonical ORIGIN cannot answer this question: `tests/support/fixtures.ts` and
// `tests/support/tool-fixtures.ts` both re-export vitest's `expect`, so both canonically resolve to the
// same external declaration. What differs is which module the consumer NAMED — the authored door, which
// `ModuleMemberOrigin` preserves by contract — and, for the tooling mirror, whether that door is the one
// that installs the RESULT snapshot serializer (Core-Tooling-Law.md §4.8: entering through the plain door
// bakes unnormalized inline snapshots). Both are read structurally, so a rename of either door is free.
import type { ImportDeclaration, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { FixtureDoor } from "../contract/test-runner-door.ts";
import { readMemberReference, referenceResolutionServices } from "./reference-fact.ts";

/** The runner packages a test may never enter directly (core/Spine-Testing.md §4). */
export const TEST_RUNNER_MODULES: ReadonlySet<string> = new Set(["vitest", "@playwright/test"]);

/** The composed-fixture names the doctrine is about. */
export const FIXTURE_NAMES: ReadonlySet<string> = new Set(["test", "it", "expect"]);

const SERIALIZER_REGISTRATION = "addSnapshotSerializer";

/** A DOOR RESOLVING TO A FILE IS NOT A PROJECT DOOR. A typed workspace resolves a package specifier to its
 *  shipped declarations, so `@playwright/experimental-ct-react` answers `getModuleSpecifierSourceFile()`
 *  with a real file under `node_modules/`. Classifying that as a composed project door made the tooling
 *  mirror demand a serializer registration from a third-party package — four false positives on the real
 *  tree, on the two CT specs that legitimately enter through the CT runner. */
const EXTERNAL_PACKAGE_INFIX = "/node_modules/";

function classify(declaration: ImportDeclaration): FixtureDoor {
  const specifier = declaration.getModuleSpecifierValue();
  if (TEST_RUNNER_MODULES.has(specifier)) {
    return { kind: "runner", specifier };
  }
  const sourceFile = declaration.getModuleSpecifierSourceFile();
  if (sourceFile !== undefined) {
    return sourceFile.getFilePath().replaceAll("\\", "/").includes(EXTERNAL_PACKAGE_INFIX)
      ? { kind: "external", specifier }
      : { kind: "project", specifier, sourceFile };
  }
  return specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("#")
    ? { kind: "unresolved", detail: `door ${specifier} resolves to no module` }
    : { kind: "external", specifier };
}

/** The door an import specifier, or a namespace member read, entered through. */
export function readFixtureDoor(node: MorphNode): FixtureDoor {
  if (Node.isImportSpecifier(node)) {
    return classify(node.getImportDeclaration());
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return { kind: "unresolved", detail: `${node.getKindName()} is not a fixture import or namespace read` };
  }
  const member = readMemberReference(node);
  if (member.kind === "unresolved") {
    return { kind: "unresolved", detail: member.detail };
  }
  const receiver = member.value.receiver;
  if (!Node.isIdentifier(receiver)) {
    return { kind: "unresolved", detail: `namespace receiver ${receiver.getText()} is not one binding` };
  }
  const declaration = referenceResolutionServices.declarationOf(receiver);
  if (declaration.kind === "unresolved") {
    return { kind: "unresolved", detail: declaration.detail };
  }
  if (!Node.isNamespaceImport(declaration.value)) {
    return { kind: "unresolved", detail: `${declaration.value.getKindName()} is not a namespace import` };
  }
  const importDeclaration = declaration.value.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return importDeclaration === undefined ? { kind: "unresolved", detail: "namespace import has no import declaration" } : classify(importDeclaration);
}

/** Does this composed door INSTALL the RESULT snapshot serializer? That registration is the whole reason
 *  §4.8 names a second door, and reading it structurally means the door may be renamed or moved freely. The
 *  read is bounded to the door's own top-level statements — never a descendant sweep. */
export function registersSnapshotSerializer(sourceFile: SourceFile): boolean {
  return sourceFile.getStatements().some((statement) => {
    if (!Node.isExpressionStatement(statement)) {
      return false;
    }
    const expression = referenceResolutionServices.unwrapExpression(statement.getExpression());
    if (!Node.isCallExpression(expression)) {
      return false;
    }
    const member = readMemberReference(expression.getExpression());
    return member.kind === "resolved" && member.value.name === SERIALIZER_REGISTRATION;
  });
}
