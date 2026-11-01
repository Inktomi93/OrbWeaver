// Server state written after module load is shared by every composition root in the process; a root owns it instead.
// Syntactic by design: a write through an alias, a helper the binding is passed to or another module is root-isolation's to catch.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const IDENTITY_KEYED = new Set(["WeakMap", "WeakSet"]);

const MUTATING_METHODS = new Set(["set", "add", "delete", "push", "clear", "splice", "shift", "unshift", "pop", "sort", "reverse", "fill", "copyWithin"]);

// `Object.assign(target, …)` and `Reflect.set(target, …)` write their first argument.
const WRITING_STATICS = new Set(["Object.assign", "Reflect.set"]);

// Calls that read the clock, the PRNG or a fresh id: run at load, each one becomes a single process-wide value.
const LOAD_TIME_CALLS = new Set(["crypto.randomUUID", "Date.now", "performance.now", "Math.random"]);

const TRANSPARENT = new Set(["TSNonNullExpression", "TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion"]);

const MOVE_HINT =
  "build it at the composition root (createProcessSeams/createServices) and pass it down, or exempt the file in eslint.config.ts with a reason when the module is its own process";

type Transparent = TSESTree.TSNonNullExpression | TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression | TSESTree.TSTypeAssertion;

function isTransparent(node: TSESTree.Node): node is Transparent {
  return TRANSPARENT.has(node.type);
}

function isTransparentAround(parent: TSESTree.Node, node: TSESTree.Node): boolean {
  return isTransparent(parent) && parent.expression === node;
}

/** The outermost member chain an identifier heads, through `x!` and `x as T`, so `(state.inner as T).push()` reads as
 *  a write to `state`. */
function chainHead(identifier: TSESTree.Identifier): TSESTree.Node {
  let node: TSESTree.Node = identifier;
  for (;;) {
    const parent: TSESTree.Node | undefined = node.parent;
    if (parent === undefined) {
      return node;
    }
    if (isTransparentAround(parent, node) || (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === node)) {
      node = parent;
      continue;
    }
    return node;
  }
}

function memberName(member: TSESTree.MemberExpression): string | undefined {
  if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
    return member.property.name;
  }
  return member.property.type === AST_NODE_TYPES.Literal && typeof member.property.value === "string" ? member.property.value : undefined;
}

function spelledCallee(callee: TSESTree.Expression): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && callee.object.type === AST_NODE_TYPES.Identifier
    ? `${callee.object.name}.${memberName(callee) ?? ""}`
    : undefined;
}

// The innermost member under any `x!`/`x as T` wrappers, which is the node a call or an assignment names.
function memberUnder(node: TSESTree.Node): TSESTree.MemberExpression | undefined {
  let current = node;
  while (isTransparent(current)) {
    current = current.expression;
  }
  return current.type === AST_NODE_TYPES.MemberExpression ? current : undefined;
}

/** True when `head` is handed as the target of `Object.assign` or `Reflect.set`. */
function writtenByStatic(head: TSESTree.Node): boolean {
  const parent = head.parent;
  if (parent?.type !== AST_NODE_TYPES.CallExpression || parent.arguments[0] !== head) {
    return false;
  }
  const spelled = spelledCallee(parent.callee);
  return spelled !== undefined && WRITING_STATICS.has(spelled);
}

/** True when a reference writes through the binding: a mutating call, a member assignment, update or delete, or a
 *  static writer handed the binding as its target. */
function writesThrough(identifier: TSESTree.Identifier): boolean {
  const head = chainHead(identifier);
  if (writtenByStatic(head)) {
    return true;
  }
  const member = memberUnder(head);
  const parent = head.parent;
  if (member === undefined || parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === head) {
    const name = memberName(member);
    return name !== undefined && MUTATING_METHODS.has(name);
  }
  return (
    (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left === head) ||
    (parent.type === AST_NODE_TYPES.UpdateExpression && parent.argument === head) ||
    (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === "delete" && parent.argument === head)
  );
}

/** A clock, PRNG or id read evaluated when the module loads, spelled for the message. */
function loadTimeMint(init: TSESTree.Expression | null): string | undefined {
  if (init?.type === AST_NODE_TYPES.NewExpression) {
    return init.callee.type === AST_NODE_TYPES.Identifier && init.callee.name === "Date" && init.arguments.length === 0 ? "new Date()" : undefined;
  }
  if (init?.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const spelled = spelledCallee(init.callee);
  return spelled === "randomUUID" || (spelled !== undefined && LOAD_TIME_CALLS.has(spelled)) ? `${spelled}()` : undefined;
}

// An annotated identifier's range includes `: Type`; the bare name is the position that carries the finding.
function nameLoc(id: TSESTree.VariableDeclarator["id"]): TSESTree.SourceLocation {
  return id.type === AST_NODE_TYPES.Identifier
    ? { start: id.loc.start, end: { line: id.loc.start.line, column: id.loc.start.column + id.name.length } }
    : id.loc;
}

// A WeakMap or WeakSet holds a value only for a key object its caller already owns, so one root's entries are
// unreachable from another root that holds different keys.
function identityKeyed(init: TSESTree.Expression | null): boolean {
  return init?.type === AST_NODE_TYPES.NewExpression && init.callee.type === AST_NODE_TYPES.Identifier && IDENTITY_KEYED.has(init.callee.name);
}

function findingOf(context: OrbRuleContext, kind: TSESTree.VariableDeclaration["kind"], declarator: TSESTree.VariableDeclarator): string | undefined {
  if (kind === "let" || kind === "var") {
    return `Module-scope \`${kind}\` is process-wide state every root shares`;
  }
  const minted = loadTimeMint(declarator.init);
  if (minted !== undefined) {
    return `A module-scope value minted by ${minted} at load is one process-wide value`;
  }
  if (identityKeyed(declarator.init)) {
    return undefined;
  }
  const written = context.sourceCode
    .getDeclaredVariables(declarator)
    .flatMap(({ references }) => references)
    .some(({ identifier }) => identifier.type === AST_NODE_TYPES.Identifier && writesThrough(identifier));
  return written ? "A module-scope binding written after load is process-wide state every root shares" : undefined;
}

/** Module-level declarations: top-level statements, exported declarations and those inside top-level blocks. */
function moduleDeclarations(statements: readonly TSESTree.ProgramStatement[] | readonly TSESTree.Statement[]): TSESTree.VariableDeclaration[] {
  return statements.flatMap((statement): TSESTree.VariableDeclaration[] => {
    const declared = statement.type === AST_NODE_TYPES.ExportNamedDeclaration ? statement.declaration : statement;
    if (declared?.type === AST_NODE_TYPES.VariableDeclaration) {
      return [declared];
    }
    return declared?.type === AST_NODE_TYPES.BlockStatement ? moduleDeclarations(declared.body) : [];
  });
}

export const moduleStateRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      Program: (program: TSESTree.Program): void => {
        for (const declaration of moduleDeclarations(program.body)) {
          for (const declarator of declaration.declarations) {
            const finding = findingOf(context, declaration.kind, declarator);
            if (finding !== undefined) {
              context.report({ loc: nameLoc(declarator.id), message: `${finding}; ${MOVE_HINT}.` });
            }
          }
        }
      },
    };
  },
};
