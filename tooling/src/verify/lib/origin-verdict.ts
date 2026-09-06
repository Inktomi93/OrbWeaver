// The THREE-answer classifier every canonical-origin policy shares.
//
// A shared origin reader returns a value or one precise refusal. A POLICY needs one more distinction that
// the reader deliberately does not make, because it is a policy judgement: a refusal can mean either
//
//   (a) "this reference provably binds something else" — a local function, a parameter, a class method, a
//       property of a plain object. The subject is a DIFFERENT identity, so the policy passes it; or
//   (b) "this reference could not be read at all" — an import door with no resolvable target, a member of
//       an opaque receiver. The subject MIGHT be the banned identity, so the policy reports it.
//
// Conflating them is how a text-keyed gate acquires permanent exemption markers (every local `Provider` /
// `fetch` / `forwardRef` lookalike) or a silent green (every unreadable door). One home so the twelve
// canonical-origin policies cannot drift apart on the answer.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { ReferenceUnresolvedReason } from "../contract/reference-fact.ts";

/** Refusals that mean "no ONE authored source exists", whatever the leaf symbol says. A written binding, a
 *  resolution cycle and a multiply-declared symbol are unknowable by construction: `let fetch = globalThis.fetch`
 *  binds a local declaration AND still holds the banned identity, so (a) must not absorb it. */
const AMBIGUOUS_REASONS: ReadonlySet<ReferenceUnresolvedReason> = new Set<ReferenceUnresolvedReason>(["write", "cycle", "ambiguous"]);

function isModuleAliasDeclaration(declaration: MorphNode): boolean {
  return Node.isImportSpecifier(declaration) || Node.isImportClause(declaration) || Node.isNamespaceImport(declaration) || Node.isExportSpecifier(declaration);
}

/** The leaf identifier whose symbol carries this reference's binding: a member read is bound by its NAME,
 *  a bare reference by itself. */
function leafIdentifier(node: MorphNode): MorphNode {
  return Node.isPropertyAccessExpression(node) ? node.getNameNode() : node;
}

/** Does this reference PROVABLY bind a declaration that is not a module import at all — a local function,
 *  parameter, method, class or property? That is case (a): a different identity, not an unreadable one. */
export function bindsProvenNonModuleDeclaration(node: MorphNode): boolean {
  const leaf = leafIdentifier(node);
  if (!Node.isIdentifier(leaf)) {
    return false;
  }
  const declarations = leaf.getSymbol()?.getDeclarations() ?? [];
  return declarations.length > 0 && !declarations.some(isModuleAliasDeclaration);
}

/** Classify one refusal into the policy's two answers. Fail-closed by default: only a PROVEN foreign
 *  binding earns silence, and never for an ambiguous reason. */
export function classifyOriginRefusal(reason: ReferenceUnresolvedReason, node: MorphNode): "other" | "unreadable" {
  if (AMBIGUOUS_REASONS.has(reason)) {
    return "unreadable";
  }
  return bindsProvenNonModuleDeclaration(node) ? "other" : "unreadable";
}
