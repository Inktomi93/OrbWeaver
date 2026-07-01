// Gate: no-inline-union-redecl (core/Spine-TypeScript-and-Patterns.md §7.5) — a string-union AXIS is declared
// ONCE as an `as const` tuple and the union DERIVED ((typeof X)[number] / z.enum(X)); never re-spelled.
// Two checks:
//   (A) an inline string-literal union TYPE ALIAS of >=3 members — declare it as a tuple + derive.
//   (B) ANY inline string-literal set whose members EXACTLY EQUAL an existing canonical `as const` tuple
//       — re-spelling a homed axis. Catches the forms (A) misses: a union in an interface/type-literal
//       PROPERTY position, and a `z.enum([...])` literal-array call. (This is the AUTH_MODE bug: the axis
//       had a home in @orb/contracts but env's `z.enum([...])` and AuthConfig.mode re-spelled it — neither
//       is a type alias, so (A) was blind to both.) A genuine one-off enum with NO canonical tuple (e.g.
//       NODE_ENV) is NOT flagged — only re-spells of an axis that already has a home.
import type {
  ArrayLiteralExpression,
  CallExpression,
  SourceFile,
  UnionTypeNode,
  VariableDeclaration,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const MIN_MEMBERS = 3;
const SEP = " ";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Order-independent identity of a string-literal set. */
function sig(members: readonly string[]): string {
  return [...new Set(members)].sort().join(SEP);
}

/** The string members of an array literal, or undefined if any element isn't a string literal. */
function stringArrayMembers(arr: ArrayLiteralExpression): string[] | undefined {
  const els = arr.getElements();
  const out: string[] = [];
  for (const e of els) {
    if (!Node.isStringLiteral(e)) {
      return;
    }
    out.push(e.getLiteralText());
  }
  return out.length > 0 ? out : undefined;
}

/** The string members of an all-string-literal union, or undefined otherwise. */
function unionStringMembers(node: UnionTypeNode): string[] | undefined {
  const out: string[] = [];
  for (const part of node.getTypeNodes()) {
    if (!Node.isLiteralTypeNode(part)) {
      return;
    }
    const lit = part.getLiteral();
    if (!Node.isStringLiteral(lit)) {
      return;
    }
    out.push(lit.getLiteralText());
  }
  return out.length > 0 ? out : undefined;
}

/** The `z.enum([...])` literal-array members of a call, or undefined if it isn't that shape. */
function zEnumArrayMembers(call: CallExpression): string[] | undefined {
  if (!call.getExpression().getText().endsWith(".enum")) {
    return;
  }
  const [arg] = call.getArguments();
  return arg !== undefined && Node.isArrayLiteralExpression(arg)
    ? stringArrayMembers(arg)
    : undefined;
}

/** sig of a `const X = [...] as const` string tuple (>=MIN_MEMBERS), or undefined. */
function tupleSig(decl: VariableDeclaration): string | undefined {
  const init = decl.getInitializer();
  if (
    init === undefined ||
    !Node.isAsExpression(init) ||
    init.getTypeNode()?.getText() !== "const"
  ) {
    return;
  }
  const expr = init.getExpression();
  if (!Node.isArrayLiteralExpression(expr)) {
    return;
  }
  const members = stringArrayMembers(expr);
  return members !== undefined && members.length >= MIN_MEMBERS ? sig(members) : undefined;
}

/** sig → tuple name for every `export const X = [...] as const` string tuple in the project. */
function collectCanonicalTuples(files: readonly SourceFile[]): Map<string, string> {
  const tuples = new Map<string, string>();
  for (const sf of files) {
    for (const decl of sf.getVariableDeclarations()) {
      const s = tupleSig(decl);
      if (s !== undefined) {
        tuples.set(s, decl.getName());
      }
    }
  }
  return tuples;
}

function checkAliases(sf: SourceFile, rel: string, out: Violation[]): void {
  for (const alias of sf.getTypeAliases()) {
    const typeNode = alias.getTypeNode();
    if (typeNode === undefined || !Node.isUnionTypeNode(typeNode)) {
      continue;
    }
    const members = unionStringMembers(typeNode);
    if (members === undefined || members.length < MIN_MEMBERS) {
      continue;
    }
    out.push({
      file: rel,
      line: alias.getStartLineNumber(),
      message: `inline string-literal union '${alias.getName()}' (${members.length} members) — declare the axis once as a tuple (export const X = [...] as const) and derive ((typeof X)[number]). §7.5`,
    });
  }
}

function checkRespells(
  sf: SourceFile,
  rel: string,
  tuples: ReadonlyMap<string, string>,
  out: Violation[],
): void {
  for (const union of sf.getDescendantsOfKind(SyntaxKind.UnionType)) {
    if (union.getParent()?.getKind() === SyntaxKind.TypeAliasDeclaration) {
      continue; // (A) owns aliases.
    }
    const members = unionStringMembers(union);
    const name = members === undefined ? undefined : tuples.get(sig(members));
    if (name !== undefined) {
      out.push({
        file: rel,
        line: union.getStartLineNumber(),
        message: `inline union re-spells the canonical tuple '${name}' — derive ((typeof ${name})[number]) instead of re-spelling its members. §7.5`,
      });
    }
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const members = zEnumArrayMembers(call);
    const name = members === undefined ? undefined : tuples.get(sig(members));
    if (name !== undefined) {
      out.push({
        file: rel,
        line: call.getStartLineNumber(),
        message: `z.enum([...]) re-spells the canonical tuple '${name}' — use z.enum(${name}). §7.5`,
      });
    }
  }
}

export const noInlineUnionRedecl: Check = {
  name: "no-inline-union-redecl",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    const files = project.getSourceFiles();
    const tuples = collectCanonicalTuples(files);
    for (const sf of files) {
      const rel = relPath(root, sf.getFilePath());
      checkAliases(sf, rel, violations);
      checkRespells(sf, rel, tuples, violations);
    }
    return violations;
  },
};
