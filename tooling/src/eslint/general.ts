import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, AST_TOKEN_TYPES, TSESLint } from "@typescript-eslint/utils";
import { staticKeyName, staticMemberName } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const COMMENTED_CODE = /^\s*(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|throw|await)\b.*[;{}]\s*$/u;

export const commentedCodeRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      Program: () => {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === AST_TOKEN_TYPES.Line && COMMENTED_CODE.test(comment.value)) {
            context.report({
              loc: comment.loc,
              message: "Commented-out code; delete it (git history keeps it). Comments are for prose, not parked code (.claude/rules/comments.md).",
            });
          }
        }
      },
    };
  },
};

const SINGLE_REPLICA_ANNOTATION = "ASSUMES(single-replica)";

const STATE_CONSTRUCTORS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);

const ARRAY_MUTATORS = new Set(["push", "shift", "splice", "unshift"]);

function singleReplicaConstruction(init: TSESTree.NewExpression, classes: ReadonlyMap<string, TSESTree.ClassDeclaration>): string {
  if (init.callee.type !== AST_NODE_TYPES.Identifier) {
    return "";
  }
  const name = init.callee.name;
  if (STATE_CONSTRUCTORS.has(name)) {
    const seededByLiteral = init.arguments.length === 1 && (init.arguments[0] as TSESTree.CallExpressionArgument).type === AST_NODE_TYPES.ArrayExpression;
    return seededByLiteral ? "" : `a \`new ${name}()\``;
  }
  const mutable = classes
    .get(name)
    ?.body.body.some((member) => (member.type === AST_NODE_TYPES.PropertyDefinition || member.type === AST_NODE_TYPES.AccessorProperty) && !member.readonly);
  return mutable === true ? `an instance of the locally-declared class \`${name}\` with a non-readonly field` : "";
}

export const assumesSingleReplicaRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const sourceCode = context.sourceCode;
    const isMutated = (declarator: TSESTree.VariableDeclarator) =>
      sourceCode
        .getDeclaredVariables(declarator)
        .flatMap(({ references }) => references)
        .some(({ identifier }) => {
          const member = identifier.parent;
          return (
            member.type === AST_NODE_TYPES.MemberExpression &&
            member.object === identifier &&
            !member.computed &&
            ARRAY_MUTATORS.has((member.property as TSESTree.Identifier).name) &&
            member.parent.type === AST_NODE_TYPES.CallExpression &&
            member.parent.callee === member
          );
        });
    const detailOf = (declarator: TSESTree.VariableDeclarator, classes: ReadonlyMap<string, TSESTree.ClassDeclaration>) => {
      const init = declarator.init;
      if (init?.type === AST_NODE_TYPES.ArrayExpression) {
        return isMutated(declarator) ? "an array accumulator mutated via push/shift/splice/unshift" : "";
      }
      return init?.type === AST_NODE_TYPES.NewExpression ? singleReplicaConstruction(init, classes) : "";
    };
    return {
      Program: (program: TSESTree.Program) => {
        if (sourceCode.getAllComments().some(({ value }) => value.includes(SINGLE_REPLICA_ANNOTATION))) {
          return;
        }
        const statements = program.body.map((statement) =>
          statement.type === AST_NODE_TYPES.ExportNamedDeclaration || statement.type === AST_NODE_TYPES.ExportDefaultDeclaration
            ? statement.declaration
            : statement,
        );
        const classes = new Map(
          statements
            .filter((s): s is TSESTree.ClassDeclaration & { id: TSESTree.Identifier } => s?.type === AST_NODE_TYPES.ClassDeclaration && s.id !== null)
            .map((s) => [s.id.name, s]),
        );
        const declarators = statements.flatMap((statement) => (statement?.type === AST_NODE_TYPES.VariableDeclaration ? statement.declarations : []));
        for (const declarator of declarators) {
          const detail = detailOf(declarator, classes);
          if (detail !== "") {
            const id = declarator.id;
            // An annotated identifier's range includes `: Type`; the bare name is the position that carries the finding.
            const loc =
              id.type === AST_NODE_TYPES.Identifier
                ? { start: id.loc.start, end: { line: id.loc.start.line, column: id.loc.start.column + id.name.length } }
                : id.loc;
            context.report({
              loc,
              message: `Module-scope mutable per-process state (${detail}); annotate the file with ASSUMES(single-replica) naming a DB-backed replacement seam, or move the state out of module scope.`,
            });
          }
        }
      },
    };
  },
};

export function lexicalVariable(context: OrbRuleContext, identifier: TSESTree.Identifier | TSESTree.JSXIdentifier): TSESLint.Scope.Variable | undefined {
  let variable: TSESLint.Scope.Variable | undefined;
  for (let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      break;
    }
  }
  return variable;
}

const SIDE_GEN_KNOBS = new Set(["temperature", "maxOutputTokens", "topP"]);

const SIDE_GEN_SHARED_KNOB = "maxTokens";

const SIDE_GEN_MESSAGE =
  "Hardcoded side-gen sampling value: resolve the posture through resolveSideGenSampling and SIDE_GEN_POSTURES from @orb/contracts/preset; a buried constant is a value the user's preset params can never override.";

function authoredNumber(context: OrbRuleContext, node: TSESTree.Node, hops = 4): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    return typeof node.value === "number";
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression && (node.operator === "-" || node.operator === "+")) {
    return authoredNumber(context, node.argument, hops);
  }
  if (node.type !== AST_NODE_TYPES.Identifier || hops === 0) {
    return false;
  }
  const definition = lexicalVariable(context, node)?.defs[0];
  return (
    definition?.type === TSESLint.Scope.DefinitionType.Variable &&
    definition.parent.kind === "const" &&
    definition.node.init !== null &&
    authoredNumber(context, definition.node.init, hops - 1)
  );
}

export const sideGenSamplingRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "ObjectExpression > Property[kind='init']"(property: TSESTree.Property): void {
        const name = staticKeyName(context, property);
        const knob =
          SIDE_GEN_KNOBS.has(name as string) ||
          (name === SIDE_GEN_SHARED_KNOB &&
            property.parent.properties.some(
              (sibling) => sibling.type === AST_NODE_TYPES.Property && SIDE_GEN_KNOBS.has(staticKeyName(context, sibling) as string),
            ));
        if (knob && authoredNumber(context, property.value)) {
          context.report({ node: property.key, message: SIDE_GEN_MESSAGE });
        }
      },
    };
  },
};

export function singleInitializer(context: OrbRuleContext, identifier: TSESTree.Node): TSESTree.Expression | undefined {
  const variable = identifier.type === AST_NODE_TYPES.Identifier ? lexicalVariable(context, identifier) : undefined;
  const [definition] = variable?.defs ?? [];
  const declarator = variable?.defs.length === 1 && definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.node : undefined;
  const unwritten = variable?.references.every((reference) => !reference.isWrite() || reference.init === true) === true;
  return declarator?.id.type === AST_NODE_TYPES.Identifier && declarator.init !== null && unwritten ? declarator.init : undefined;
}

const JSON_METHOD = "json";

const TEXT_METHOD = "text";

const THEN_METHOD = "then";

const PARSE_METHOD = "parse";

function keepsUnknown(type: TSESTree.TypeNode): boolean {
  if (type.type === AST_NODE_TYPES.TSUnknownKeyword) {
    return true;
  }
  if (type.type === AST_NODE_TYPES.TSTypeReference) {
    const params = type.typeArguments?.params ?? [];
    return params.length === 1 && keepsUnknown(params[0] as TSESTree.TypeNode);
  }
  return (
    type.type === AST_NODE_TYPES.TSTypeLiteral &&
    type.members.every(
      (member) =>
        member.type === AST_NODE_TYPES.TSPropertySignature && member.typeAnnotation !== undefined && keepsUnknown(member.typeAnnotation.typeAnnotation),
    )
  );
}

function unwrapBody(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  for (;;) {
    if (current.type === AST_NODE_TYPES.AwaitExpression) {
      current = current.argument;
    } else if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = current.expression;
    } else if (
      (current.type === AST_NODE_TYPES.TSAsExpression || current.type === AST_NODE_TYPES.TSSatisfiesExpression) &&
      keepsUnknown(current.typeAnnotation)
    ) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

export const wireJsonRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const bodyExpression = (node: TSESTree.Node) => {
      const current = unwrapBody(node);
      const initializer = singleInitializer(context, current);
      return initializer === undefined ? current : unwrapBody(initializer);
    };
    // `<x>.<method>()` with no arguments: the method's name node.
    const bodyRead = (node: TSESTree.Node, method: string) => {
      const callee = node.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
      return callee !== undefined && (node as TSESTree.CallExpression).arguments.length === 0 && staticMemberName(callee) === method
        ? (callee as TSESTree.MemberExpression).property
        : undefined;
    };
    // The value a `.then` callback resolves to: its expression body, or its block's final `return`.
    const callbackResult = (callback: TSESTree.CallExpressionArgument | undefined) => {
      if (callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression && callback?.type !== AST_NODE_TYPES.FunctionExpression) {
        return;
      }
      if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
        return callback.body;
      }
      const last = callback.body.body.at(-1);
      return last?.type === AST_NODE_TYPES.ReturnStatement ? (last.argument ?? undefined) : undefined;
    };
    const bodyReadUnder = (operand: TSESTree.Node) => {
      const current = bodyExpression(operand);
      const json = bodyRead(current, JSON_METHOD);
      if (json !== undefined || current.type !== AST_NODE_TYPES.CallExpression) {
        return json;
      }
      const name = staticMemberName(current.callee);
      const [first] = current.arguments;
      if (name === THEN_METHOD) {
        const result = callbackResult(first);
        return result === undefined ? undefined : bodyRead(bodyExpression(result), JSON_METHOD);
      }
      const parsesText =
        name === PARSE_METHOD &&
        (current.callee as TSESTree.MemberExpression).object.type === AST_NODE_TYPES.Identifier &&
        ((current.callee as TSESTree.MemberExpression).object as TSESTree.Identifier).name === "JSON" &&
        first !== undefined;
      return parsesText && bodyRead(bodyExpression(first), TEXT_METHOD) !== undefined ? (current.callee as TSESTree.MemberExpression).property : undefined;
    };
    const check = (cast: TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression) => {
      if (keepsUnknown(cast.typeAnnotation)) {
        return;
      }
      const name = bodyReadUnder(cast.expression);
      if (name !== undefined) {
        context.report({
          node: name,
          message:
            "A response body is cast instead of parsed: `.json()` returns unknown and the cast trusts a shape the peer can change without the consumer compiling differently. Parse it with the boundary's canonical schema (`schema.parse(await res.json())`).",
        });
      }
    };
    return { TSAsExpression: check, TSSatisfiesExpression: check };
  },
};
