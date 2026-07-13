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
  UnionTypeNode,
  VariableDeclaration,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

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

// Arm A (an inline string-union type-alias ≥3 members) is self-contained per alias → emitted at visit.
// Arm B (an inline union / z.enum re-spelling a CANONICAL tuple) needs ALL tuples collected before it can
// judge (a re-spell can reference a tuple declared later in the walk), so re-spell candidates are
// accumulated in visit and reconciled against the collected tuples in `finalize`.
// legacy Check.
type RespellCandidate = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly sig: string;
  readonly kind: "union" | "zenum";
};
const passTuples = new Map<string, string>(); // sig → tuple name
const passRespells: RespellCandidate[] = [];

function candidateColumn(node: Node): number {
  return node.getSourceFile().getLineAndColumnAtPos(node.getStart()).column;
}

function pushRespell(node: Node, root: string, members: string[], kind: "union" | "zenum"): void {
  passRespells.push({
    file: relPath(root, node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
    column: candidateColumn(node),
    sig: sig(members),
    kind,
  });
}

/** Arm A — emit an inline string-union type alias (≥3 members) immediately; it is self-contained. */
function visitAlias(node: Node, ctx: GateRunCtx): void {
  if (!Node.isTypeAliasDeclaration(node)) {
    return;
  }
  const typeNode = node.getTypeNode();
  if (typeNode === undefined || !Node.isUnionTypeNode(typeNode)) {
    return;
  }
  const members = unionStringMembers(typeNode);
  if (members !== undefined && members.length >= MIN_MEMBERS) {
    ctx.report(node, { token: `union ${node.getName()}`, offset: 0 });
  }
}

/** Arm B candidates — accumulate a non-alias UnionType / a z.enum([...]) for finalize reconciliation. */
function visitRespellCandidate(node: Node, root: string): void {
  if (Node.isUnionTypeNode(node)) {
    if (node.getParent()?.getKind() === SyntaxKind.TypeAliasDeclaration) {
      return; // arm A owns aliases
    }
    const members = unionStringMembers(node);
    if (members !== undefined) {
      pushRespell(node, root, members, "union");
    }
    return;
  }
  if (Node.isCallExpression(node)) {
    const members = zEnumArrayMembers(node);
    if (members !== undefined) {
      pushRespell(node, root, members, "zenum");
    }
  }
}

export const gate: GateDescriptor = {
  name: "no-inline-union-redecl",
  docRow: "core/Spine-TypeScript-and-Patterns.md §7.5",
  status: "active",
  scopeSafety: "whole-project", // arm B compares against tuples collected from the whole tree
  message:
    "an inline string-literal union re-spells (or should derive from) a canonical `as const` tuple — declare the axis ONCE as a tuple (export const X = [...] as const) and derive ((typeof X)[number] / z.enum(X)). Spine-TypeScript-and-Patterns.md §7.5",
  fix: "derive the union from the homed tuple: `(typeof X)[number]` (or `z.enum(X)`) — never re-spell its members.",
  // Pinned to packages+tests: the §2.2 fold-in globs scripts/check/gates/** into the workspace; a gate
  // file's inline-union EXAMPLE strings (mustFlag fixtures) are not real axis declarations, and the gate
  // corpus never homes a canonical tuple — this pin keeps both arms' findings byte-identical to before.
  scanRoot: (p) => !p.startsWith("scripts/check/gates/"),
  kinds: [
    SyntaxKind.VariableDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.UnionType,
    SyntaxKind.CallExpression,
  ],
  begin: () => {
    passTuples.clear();
    passRespells.length = 0;
  },
  visit: (node, _sf, ctx) => {
    // Collect canonical tuples (for arm B's finalize reconciliation).
    if (Node.isVariableDeclaration(node)) {
      const s = tupleSig(node);
      if (s !== undefined) {
        passTuples.set(s, node.getName());
      }
      return;
    }
    visitAlias(node, ctx); // arm A (self-contained)
    visitRespellCandidate(node, ctx.root); // arm B (accumulate)
  },
  finalize: (ctx: GateRunCtx) => {
    for (const c of passRespells) {
      const name = passTuples.get(c.sig);
      if (name === undefined) {
        continue;
      }
      const message =
        c.kind === "zenum"
          ? `z.enum([...]) re-spells the canonical tuple '${name}' — use z.enum(${name}). Spine-TypeScript-and-Patterns.md §7.5`
          : `inline union re-spells the canonical tuple '${name}' — derive ((typeof ${name})[number]) instead of re-spelling its members. Spine-TypeScript-and-Patterns.md §7.5`;
      ctx.report({
        file: c.file,
        line: c.line,
        column: c.column,
        message,
        token: `re-spell ${name}`,
      });
    }
  },
  mustFlag: [
    {
      files: "export type Mode = 'a' | 'b' | 'c';\n",
      at: "packages/contracts/src/x.ts",
      expect: { messageIncludes: "declare the axis" },
      why: "an inline string-union type alias of ≥3 members (arm A) — declare a tuple + derive (§7.5)",
    },
    {
      files: {
        "packages/contracts/src/home.ts": "export const AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/x.ts": "export interface T { mode: 'a' | 'b' | 'c' }\n",
      },
      expect: { messageIncludes: "re-spells the canonical tuple" },
      why: "an inline union re-spelling a homed `as const` tuple (arm B, cross-file) — derive instead",
    },
    {
      files: {
        "packages/contracts/src/mode-home.ts": "export const MODE = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/z.ts": "export const schema = z.enum(['a', 'b', 'c']);\n",
      },
      expect: { messageIncludes: "z.enum([...]) re-spells the canonical tuple" },
      why: "a `z.enum([...])` respelling a homed `as const` tuple (arm B ZENUM sub-kind — the AUTH_MODE bug) — use z.enum(X)",
    },
  ],
  mustPass: [
    {
      files: "export type NodeEnv = 'development' | 'production';\n",
      at: "packages/contracts/src/y.ts",
      why: "a 2-member one-off union with no canonical tuple — under the ≥3 floor + no home, passes",
    },
    {
      files: "export const schema = z.enum(['development', 'production', 'test']);\n",
      at: "packages/contracts/src/env.ts",
      why: "a `z.enum([...])` one-off (NODE_ENV-class) with NO matching canonical tuple in the tree — arm B no-op, passes",
    },
  ],
};
