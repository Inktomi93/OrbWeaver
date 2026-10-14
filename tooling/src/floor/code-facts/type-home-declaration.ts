// Declaration placement over delivered native nodes; consumers retain population, authority and reporting.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { inlineShapeNames, isPlainDataShape } from "./shape-declaration.ts";
import { packageContractHome, packageTypeHome } from "./type-home.ts";
import type {
  DeclarationTypeHomeOwnership,
  TypeHomeCategory,
  TypeHomeDeclarationInput,
  TypeHomeDeclarationJudgment,
  TypeHomeDeclarationPlane,
} from "./type-home-contract.ts";

const WIRE_SHAPE_SUFFIXES = ["View", "Result", "Summary", "Row", "Input", "Request", "Response", "Wire"] as const;

function declarationPlane(node: MorphNode): TypeHomeDeclarationPlane {
  if (Node.isVariableStatement(node)) {
    return "schema-origin";
  }
  return (Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) && node.hasExportKeyword() ? "direct-export" : "local-export";
}

/** Judge an existing admitted claim; unqualified ownership preserves its finding rather than granting a home. */
export function judgeTypeHomeDeclaration(node: MorphNode, input: TypeHomeDeclarationInput): TypeHomeDeclarationJudgment {
  const { path, claim } = input;
  const source = node.getSourceFile().getFilePath();
  if (path.startsWith("/") || path.split("/").some((part) => part === "." || part === "..") || !source.endsWith(`/${path}`)) {
    return { kind: "refused", reason: "Type-home source identity does not match the delivered declaration." };
  }
  if (claim === "alias-or-schema" ? !(Node.isTypeAliasDeclaration(node) || Node.isVariableStatement(node)) : !Node.isInterfaceDeclaration(node)) {
    return { kind: "not-subject" };
  }
  let names = inlineShapeNames(node);
  if (claim === "wire-interface") {
    names = names.filter((name) => WIRE_SHAPE_SUFFIXES.some((suffix) => name.getText().endsWith(suffix) && name.getText().length > suffix.length));
    if (names.length > 0 && Node.isInterfaceDeclaration(node) && !isPlainDataShape(node)) {
      return { kind: "not-subject" };
    }
  }
  if (names.length === 0) {
    return { kind: "not-subject" };
  }
  const plane = declarationPlane(node);
  return { kind: "subject", shapes: names.map((name) => ({ name, plane })), ownership: declarationTypeHome(path) };
}

const UNQUALIFIED_HOME_REASONS = {
  primitive: "Primitive ownership requires declaration provenance, not membership in kit.",
  wire: "Wire ownership requires the canonical boundary schema and derivation, not membership in contracts.",
  "db-row": "Row ownership requires the canonical table and inferred row origin, not membership in db.",
  domain: "Domain ownership requires the owning domain and lower-owned derivation evidence.",
  "client-view": "Client views and component APIs require semantic ownership; existing placement obligations remain.",
  component: "Component ownership requires the actual component API and supporting type graph.",
  "standalone-declarations": "Standalone declarations require their native runtime and distribution ownership.",
  unqualified: "This package's declaration ownership has not been adjudicated.",
} as const satisfies Readonly<Record<Exclude<TypeHomeCategory, "package-contract">, string>>;

/** Resolve only sanctioned structural ownership; package categories are never blanket declaration homes. */
function declarationTypeHome(path: string): DeclarationTypeHomeOwnership {
  const classification = packageTypeHome(path);
  if (classification === undefined) {
    return { kind: "unqualified", category: null, reason: "This source is outside package ownership; its admitted policy retains the placement obligation." };
  }
  if (classification.category === "package-contract") {
    return {
      kind: classification.home === true ? "owned" : "misplaced",
      packageName: classification.packageName,
      home: packageContractHome(classification.packageName),
    };
  }
  return { kind: "unqualified", category: classification.category, reason: UNQUALIFIED_HOME_REASONS[classification.category] };
}
