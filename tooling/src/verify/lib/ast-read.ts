// Shared value-extraction readers for gates (the house `unwrap` idiom, promoted to ONE home).
//
// A gate that reads a value off a narrow node check — e.g. `Node.isStringLiteral(init) ?
// init.getLiteralText() : undefined` — returns undefined on `id: "x" as never` (AsExpression), a
// parenthesized literal `(… )`, a `… satisfies T` expression, or a `\`x\`` NoSubstitutionTemplate, and
// then SILENTLY PASSES the violation. False-negative GREEN is the worst gate failure mode (the same
// class as the scanRoot-format precedent). These readers strip the wrappers first, so a value written in
// any of those honest-authoring shapes is still seen. Hardening only ever WIDENS what a gate detects.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

/** Strip `as X` / `satisfies X` / parentheses wrappers so the underlying literal/object/call is reachable.
 *  Mirrors the local `unwrap` in diagnostic-legibility.ts. */
export function unwrapExpression(node: Node): Node {
  let n = node;
  while (Node.isAsExpression(n) || Node.isSatisfiesExpression(n) || Node.isParenthesizedExpression(n)) {
    n = n.getExpression();
  }
  return n;
}

/** The literal string value of a `StringLiteral` or `NoSubstitutionTemplateLiteral`, seen THROUGH any
 *  `as`/`satisfies`/paren wrapper; undefined for a genuinely non-literal (an identifier, a call, a
 *  template WITH `${}` substitutions). Use this wherever a gate compares an authored string value —
 *  ids/zones/placements/keys/kinds — so a wrapped literal can't slip the check. */
export function readStringValue(node: Node): string | undefined {
  const n = unwrapExpression(node);
  return Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n) ? n.getLiteralText() : undefined;
}

/** Per-file `bound name -> declarations`, document-ordered, built once per SourceFile.
 *
 *  Several gates ask the same question — "which declarations in this file bind the name X" — and each used
 *  to answer it by re-walking every declaration in the file, inside a loop over candidates. Measured
 *  2026-08-31: 97.8% of those sweeps were repeats of one already performed, and the gates doing it were
 *  96.4s of a 300.8s pass (docs/reviews/research/2026-08-31-gate-pass-unified-walk.md §2).
 *
 *  KEYED ON `sf.compilerNode`, NEVER ON THE `SourceFile` WRAPPER: `createSourceFile(…, {overwrite:true})`
 *  reuses the wrapper and forgets its descendants, so a wrapper-keyed cache returns forgotten nodes that
 *  THROW (tooling/src/verify/gates/GATE-AUTHORING.md §5, the overwrite-identity trap). */
const declarationsByName = new WeakMap<object, ReadonlyMap<string, readonly Node[]>>();

function buildDeclarationIndex(sf: SourceFile): ReadonlyMap<string, readonly Node[]> {
  const index = new Map<string, Node[]>();
  const add = (name: string, node: Node): void => {
    const list = index.get(name);
    if (list === undefined) {
      index.set(name, [node]);
    } else {
      list.push(node);
    }
  };
  for (const declaration of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = declaration.getNameNode();
    if (Node.isIdentifier(nameNode)) {
      add(nameNode.getText(), declaration);
      continue;
    }
    if (Node.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.getElements()) {
        add(element.getName(), declaration);
      }
    }
  }
  for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName();
    if (name !== undefined) {
      add(name, fn);
    }
  }
  return index;
}

/** The declarations in `sf` that could bind `name`, in document order — a SUPERSET of what any one caller
 *  wants, deliberately.
 *
 *  An object-binding-pattern declaration is indexed under each element's local name, which is what the
 *  destructuring callers need but is NOT what `VariableDeclaration.getName()` returns for it. So a caller
 *  KEEPS ITS OWN PREDICATE and applies it to this list: superset + the original predicate is identical to
 *  the original whole-file walk, where narrowing the index to one caller's shape would silently change
 *  another's verdict. */
export function declarationsNamed(sf: SourceFile, name: string): readonly Node[] {
  const key: object = sf.compilerNode;
  let index = declarationsByName.get(key);
  if (index === undefined) {
    index = buildDeclarationIndex(sf);
    declarationsByName.set(key, index);
  }
  return index.get(name) ?? [];
}
