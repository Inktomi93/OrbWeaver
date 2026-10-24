// Server state written after module load is shared by every composition root in the process; a root owns it instead.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const IDENTITY_KEYED = new Set(["WeakMap", "WeakSet"]);

const MUTATING_METHODS = new Set(["set", "add", "delete", "push", "clear", "splice", "shift", "unshift", "pop"]);

const MOVE_HINT =
  "build it at the composition root (createProcessSeams/createServices) and pass it down, or exempt the file in eslint.config.ts with a reason when the module is its own process";

/** The outermost member chain an identifier heads, so `state.inner.push()` reads as a write to `state`. */
function chainHead(identifier: TSESTree.Identifier): TSESTree.Node {
  let node: TSESTree.Node = identifier;
  while (node.parent.type === "MemberExpression" && node.parent.object === node) {
    node = node.parent;
  }
  return node;
}

function memberName(member: TSESTree.MemberExpression): string | undefined {
  if (!member.computed && member.property.type === "Identifier") {
    return member.property.name;
  }
  return member.property.type === "Literal" && typeof member.property.value === "string" ? member.property.value : undefined;
}

/** True when a reference writes through the binding: a mutating call, a member assignment, update or delete. */
function writesThrough(identifier: TSESTree.Identifier): boolean {
  const head = chainHead(identifier);
  if (head === identifier) {
    return false;
  }
  const parent = head.parent;
  if (parent === undefined || head.type !== "MemberExpression") {
    return false;
  }
  if (parent.type === "CallExpression" && parent.callee === head) {
    const name = memberName(head);
    return name !== undefined && MUTATING_METHODS.has(name);
  }
  return (
    (parent.type === "AssignmentExpression" && parent.left === head) ||
    (parent.type === "UpdateExpression" && parent.argument === head) ||
    (parent.type === "UnaryExpression" && parent.operator === "delete" && parent.argument === head)
  );
}

/** `randomUUID()`, `crypto.randomUUID()` or `Date.now()`: a value minted once, when the module loads. */
function loadTimeMint(init: TSESTree.Expression | null): string | undefined {
  if (init?.type !== "CallExpression") {
    return undefined;
  }
  const callee = init.callee;
  if (callee.type === "Identifier" && callee.name === "randomUUID") {
    return "randomUUID()";
  }
  if (callee.type === "MemberExpression" && callee.object.type === "Identifier") {
    const spelled = `${callee.object.name}.${memberName(callee) ?? ""}`;
    return spelled === "crypto.randomUUID" || spelled === "Date.now" ? `${spelled}()` : undefined;
  }
  return undefined;
}

// An annotated identifier's range includes `: Type`; the bare name is the position that carries the finding.
function nameLoc(id: TSESTree.VariableDeclarator["id"]): TSESTree.SourceLocation {
  return id.type === "Identifier" ? { start: id.loc.start, end: { line: id.loc.start.line, column: id.loc.start.column + id.name.length } } : id.loc;
}

// A WeakMap or WeakSet holds a value only for a key object its caller already owns, so one root's entries are
// unreachable from another root that holds different keys.
function identityKeyed(init: TSESTree.Expression | null): boolean {
  return init?.type === "NewExpression" && init.callee.type === "Identifier" && IDENTITY_KEYED.has(init.callee.name);
}

function findingOf(context: OrbRuleContext, kind: TSESTree.VariableDeclaration["kind"], declarator: TSESTree.VariableDeclarator): string | undefined {
  if (kind === "let" || kind === "var") {
    return `Module-scope \`${kind}\` is process-wide state every root shares`;
  }
  const minted = loadTimeMint(declarator.init);
  if (minted !== undefined) {
    return `A module-scope value minted by ${minted} at load is one process-wide identity`;
  }
  if (identityKeyed(declarator.init)) {
    return undefined;
  }
  const written = context.sourceCode
    .getDeclaredVariables(declarator)
    .flatMap(({ references }) => references)
    .some(({ identifier }) => identifier.type === "Identifier" && writesThrough(identifier));
  return written ? "A module-scope binding written after load is process-wide state every root shares" : undefined;
}

export const moduleStateRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      Program: (program: TSESTree.Program): void => {
        const declarations = program.body
          .map((statement) => (statement.type === "ExportNamedDeclaration" ? statement.declaration : statement))
          .filter((statement): statement is TSESTree.VariableDeclaration => statement?.type === "VariableDeclaration");
        for (const declaration of declarations) {
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
