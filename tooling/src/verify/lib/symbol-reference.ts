// Shared SPELLING-INDEPENDENT reference readers for gates (#1506) — "does this node reference X, however
// it was written?", promoted to ONE home the way `ast-read.ts` homed "what value does this denote?".
//
// A gate that recognises its subject by ONE syntactic spelling is blind to the same semantics in another,
// and blindness is a silent GREEN — the worst gate failure mode (memory: gate-blind-spots-are-spelling-shaped).
// Three spelling families escaped 21 live gates at once:
//   • BRACKET ACCESS — `db["insert"](schema["chatDigests"])` is an ElementAccessExpression, so a gate keyed
//     on `PropertyAccessExpression.getName()` never sees it (measured on vector-scope-derived: the
//     property spelling flagged 2, all three bracket spellings flagged 0).
//   • NAMESPACE IMPORT — `import * as events from …; events.subscribeAllChatEvents(…)` produces NO
//     ImportSpecifier, so an import-specifier-keyed gate never sees the reference at all.
//   • AN IDENTIFIER STANDING FOR A LITERAL — `role={ROLE}` / `margin: -8` are not StringLiteral /
//     NumericLiteral nodes, so a literal-kind check reads them as "not my subject".
// Every reader here only ever WIDENS what a gate detects; none can turn a live finding into a pass.

import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { MemberReference } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import type { ModuleMemberReference } from "../contract/symbol-reference.ts";

/** Does the member read at `node` name one of `names`, however spelled? The one-line door for a gate whose
 *  subject is a fixed member vocabulary (`.insert`/`.update`/`.delete`, `.state`, `.printResult`). */
export function readsMemberNamed(node: Node, names: ReadonlySet<string>): MemberReference | undefined {
  const read = staticMemberAccess(node);
  return read !== undefined && names.has(read.name) ? read : undefined;
}

/** The module specifier of the `import * as ns from "<spec>"` declaration that binds this identifier, or
 *  undefined.
 *
 *  RESOLVED SYNTACTICALLY, ON PURPOSE — a namespace binding is FILE-LOCAL by construction (it can only be
 *  introduced by an import declaration in the same file), so the file's own import list is a COMPLETE
 *  answer and the language service is not needed. That matters: `getDefinitionNodes()` is the expensive
 *  door and it is the one that goes quiet inside a reused conformance Project (tooling/src/verify/gates/GATE-AUTHORING.md §12).
 *  DECLARED LIMIT: a function-scoped `const ns = …` shadowing a namespace import of the same name reads as
 *  the namespace — the widening direction, which cannot hide a violation. */
export function namespaceImportSpecifier(node: Node): string | undefined {
  if (!TsNode.isIdentifier(node)) {
    return;
  }
  const name = node.getText();
  return node
    .getSourceFile()
    .getImportDeclarations()
    .find((declaration) => declaration.getNamespaceImport()?.getText() === name)
    ?.getModuleSpecifierValue();
}

/** The local names a file binds to a NAMED import of `exportName` from a module whose specifier satisfies
 *  `matchesSpecifier` — the alias-aware set (`import { printResult as print }` binds `print`). */
export function namedImportLocalNames(sf: SourceFile, exportName: string, matchesSpecifier: (specifier: string) => boolean): ReadonlySet<string> {
  const out = new Set<string>();
  for (const declaration of sf.getImportDeclarations()) {
    if (!matchesSpecifier(declaration.getModuleSpecifierValue())) {
      continue;
    }
    for (const named of declaration.getNamedImports()) {
      if (named.getName() === exportName) {
        out.add(named.getAliasNode()?.getText() ?? named.getName());
      }
    }
  }
  return out;
}

/** Does `sf` bring in the exported member `exportName` of a module matching `matchesSpecifier` AT ALL,
 *  in either import spelling? A named import proves the member by name; a namespace import proves only the
 *  MODULE, which is the honest limit — `import * as ns from "…/contract/policy.ts"` makes every export of
 *  that module reachable, and which one a file uses is a question about its REFERENCES, not its imports
 *  (`referencesModuleExport` below is that question).
 *
 *  It exists because a file-level `getNamedImports().some(…)` test is the #1506 namespace hole in its
 *  simplest form: the namespace spelling produces no `ImportSpecifier`, so the file reads as "does not
 *  import it" and every verdict downstream of that flag silently disappears (#2459 — two policies keyed
 *  their whole gate-module recognition on it). */
export function importsModuleExport(sf: SourceFile, exportName: string, matchesSpecifier: (specifier: string) => boolean): boolean {
  if (namedImportLocalNames(sf, exportName, matchesSpecifier).size > 0) {
    return true;
  }
  return sf
    .getImportDeclarations()
    .some((declaration) => declaration.getNamespaceImport() !== undefined && matchesSpecifier(declaration.getModuleSpecifierValue()));
}

/** Does this REFERENCE node denote the exported member `exportName` of a module matching
 *  `matchesSpecifier`, however the import and the read are spelled? The two shapes are the two halves a
 *  callee position can take:
 *   • a bare identifier bound by `import { exportName }` / `import { exportName as local }`;
 *   • a member read of any spelling off an `import * as ns` binding (`ns.exportName`, `ns["exportName"]`).
 *
 *  A gate asking this about a CALLEE subscribes to `CallExpression` alone and asks about
 *  `call.getExpression()`; it needs no import-specifier visitor, which is the point. */
export function referencesModuleExport(node: Node, exportName: string, matchesSpecifier: (specifier: string) => boolean): boolean {
  if (TsNode.isIdentifier(node)) {
    return namedImportLocalNames(node.getSourceFile(), exportName, matchesSpecifier).has(node.getText());
  }
  return moduleMemberReference(node, matchesSpecifier)?.name === exportName;
}

/** THE COMBINED DOOR: does `node` reference an exported member of a module matching `matchesSpecifier`,
 *  however that reference is spelled?
 *
 *  Two shapes answer YES and they are the SAME reference:
 *   • `node` is an `ImportSpecifier` in a matching import declaration (`import { x }` / `import { x as y }`
 *     — keyed on the IMPORTED name, so an alias buys nothing);
 *   • `node` is a member read (any spelling) off an identifier bound by `import * as ns` from a matching
 *     module — the shape that has NO ImportSpecifier to subscribe to at all.
 *
 *  A gate calling this subscribes to `ImportSpecifier` PLUS `MEMBER_ACCESS_KINDS`; anything less is the
 *  hole this function exists to close. */
export function moduleMemberReference(node: Node, matchesSpecifier: (specifier: string) => boolean): ModuleMemberReference | undefined {
  if (TsNode.isImportSpecifier(node)) {
    const declaration = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    const specifier = declaration?.getModuleSpecifierValue();
    return specifier !== undefined && matchesSpecifier(specifier) ? { kind: "named-import", name: node.getName(), specifier, node } : undefined;
  }
  const read = staticMemberAccess(node);
  if (read === undefined) {
    return;
  }
  const specifier = namespaceImportSpecifier(read.receiver);
  return specifier !== undefined && matchesSpecifier(specifier) ? { kind: "namespace-member", name: read.name, specifier, node, read } : undefined;
}
