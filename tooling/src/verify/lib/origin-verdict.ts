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

import { readMemberReference } from "@orb/tooling/_shared/reference-fact";
import type { ReferenceUnresolvedReason } from "@orb/tooling/_shared/reference-fact-contract";
import type { Node as MorphNode } from "ts-morph";
import { Node, VariableDeclarationKind } from "ts-morph";
import type { OriginRefusalVerdict } from "../contract/origin-verdict.ts";

/** Refusals that mean "no ONE authored source exists", whatever the leaf symbol says. A written binding, a
 *  resolution cycle and a multiply-declared symbol are unknowable by construction: `let fetch = globalThis.fetch`
 *  binds a local declaration AND still holds the banned identity, so (a) must not absorb it. */
const AMBIGUOUS_REASONS: ReadonlySet<ReferenceUnresolvedReason> = new Set<ReferenceUnresolvedReason>(["write", "cycle", "ambiguous"]);

function isModuleAliasDeclaration(declaration: MorphNode): boolean {
  return Node.isImportSpecifier(declaration) || Node.isImportClause(declaration) || Node.isNamespaceImport(declaration) || Node.isExportSpecifier(declaration);
}

/** The leaf identifier whose symbol carries this reference's binding: a member read is bound by its NAME,
 *  a bare reference by itself.
 *
 *  IT HANDLES THE DOTTED SPELLING ONLY, AND THAT ASYMMETRY IS A CALLER'S PROBLEM TO AVOID (#2058). An
 *  `ElementAccessExpression` falls through to the `node` arm, `Node.isIdentifier` rejects it, and
 *  `bindsProvenNonModuleDeclaration` answers FALSE for a receiver it never looked at — so a caller that
 *  hands this a whole member read gets `unreadable` for `bag["key"]` and `other` for `bag.key`. It cost
 *  `tooling-argv-front-door` two real-tree errors on JSON bags.
 *
 *  THE FIX IS AT THE CALLER, NOT HERE, and the direction is why: widening this function ACQUITS, and it
 *  sits under every canonical-origin policy's fail-closed arm, so a blind widening silently narrows a
 *  dozen catches at once (guide §6's sealed-origin polarity rule, one axis over). **A caller asking "is
 *  this member read taken off X" passes the RECEIVER** — its own subject — the way
 *  `lib/process-member-origin.ts:61` now does. Callers that already pass a `callee` or an
 *  `expression()` are correct by construction. */
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
export function classifyOriginRefusal(reason: ReferenceUnresolvedReason, node: MorphNode): OriginRefusalVerdict {
  if (AMBIGUOUS_REASONS.has(reason)) {
    return "unreadable";
  }
  return bindsProvenNonModuleDeclaration(node) ? "other" : "unreadable";
}

/** Does this reference NAME `exportedName` — as a bare identifier, through an import specifier whose
 *  ORIGINAL exported name is it (so an alias still names it), or as a member read in any spelling?
 *
 *  THE MANDATORY COMPANION OF FAIL-CLOSURE, and the reason it is homed beside the classifier. Fail-closed
 *  reporting is correct for a CANDIDATE whose identity cannot be read; applied to every node of a kind in a
 *  population it converts each unreadable node into an accusation. Measured on the live tree during the
 *  #1584 sanctioned-home conversion: an unprefiltered `NewExpression` arm accused `new TRPCError(…)` of
 *  being node's `EventEmitter` (five sites) and `new AsyncLocalStorage(…)`, `new Hono(…)`,
 *  `new CardNotDistillableError(…)` of being the ambient clock (fourteen sites), because each refuses as
 *  `ambiguous`/`missing` and a bare classifier calls that unreadable. Prefilter on the name, resolve the
 *  identity, and fail closed only inside the candidate set.
 *
 *  The name is followed through an import ALIAS and through immutable CONST-ALIAS hops, because both are
 *  spellings of the same export and neither is visible in the written text of the use site. */
export function referenceNamesExport(node: MorphNode, exportedName: string): boolean {
  return namesExport(node, exportedName, new Set<object>());
}

/** One CONST-ALIAS hop, bounded by a visited set. `const D = Date; new D()` and
 *  `import { EventEmitter } from "node:events"; const EE = EventEmitter; new EE()` name their export through
 *  an immutable local binding, and a prefilter that stops at the written text hands the identity reader
 *  nothing to judge. The walk follows only a `const` initializer, so a reassignable binding stops it. */
function aliasInitializer(identifier: MorphNode): MorphNode | undefined {
  const declarations = identifier.getSymbol()?.getDeclarations() ?? [];
  const constant = declarations.find(
    (declaration) => Node.isVariableDeclaration(declaration) && declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const,
  );
  return constant === undefined || !Node.isVariableDeclaration(constant) ? undefined : constant.getInitializer();
}

function namesExport(node: MorphNode, exportedName: string, visited: Set<object>): boolean {
  if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    const member = readMemberReference(node);
    return member.kind === "resolved" && member.value.name === exportedName;
  }
  if (!Node.isIdentifier(node) || visited.has(node.compilerNode)) {
    return false;
  }
  visited.add(node.compilerNode);
  if (node.getText() === exportedName) {
    return true;
  }
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  if (declarations.some((declaration) => Node.isImportSpecifier(declaration) && declaration.getName() === exportedName)) {
    return true;
  }
  const initializer = aliasInitializer(node);
  return initializer !== undefined && namesExport(initializer, exportedName, visited);
}
