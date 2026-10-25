import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { lexicalVariable } from "./general.ts";
import { accessedName, constantInitializer, STATIC_CONST_DEPTH, staticTextValue, unwrapTsValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const LOOKUPS = new Set([
  "getElementById",
  "querySelector",
  "querySelectorAll",
  "getElementsByClassName",
  "getElementsByTagName",
  "getElementsByName",
  "closest",
]);
const CLASS_WRITES = new Set(["add", "remove", "toggle", "replace"]);
const INVOCATIONS = new Set(["call", "apply"]);

function resolved(context: OrbRuleContext, node: TSESTree.Node, depth = 0): TSESTree.Node {
  const expression = unwrapTsValue(node);
  const initializer = expression.type === "Identifier" && depth < STATIC_CONST_DEPTH ? constantInitializer(context, expression) : undefined;
  return initializer === undefined ? expression : resolved(context, initializer, depth + 1);
}

interface MemberCapability {
  readonly object: TSESTree.Node;
  readonly name: string | undefined;
}

function destructuredMember(context: OrbRuleContext, identifier: TSESTree.Identifier): MemberCapability | undefined {
  const variable = lexicalVariable(context, identifier);
  const definition = variable?.defs[0];
  if (definition?.type !== "Variable" || definition.node.id.type !== "ObjectPattern" || definition.node.init === null) {
    return undefined;
  }
  if (variable?.references.every((reference) => !reference.isWrite() || reference.init === true) !== true) {
    return undefined;
  }
  const property = definition.node.id.properties.find((entry) => entry.type === "Property" && entry.value === definition.name);
  if (property?.type !== "Property") {
    return undefined;
  }
  const name = property.key.type === "Identifier" && !property.computed ? property.key.name : staticTextValue(context, property.key);
  return { object: definition.node.init, name: typeof name === "string" ? name : undefined };
}

function calledMember(context: OrbRuleContext, node: TSESTree.Node, depth = 0): MemberCapability | undefined {
  if (depth > STATIC_CONST_DEPTH) {
    return undefined;
  }
  const expression = resolved(context, node);
  if (expression.type === "Identifier") {
    return destructuredMember(context, expression);
  }
  if (expression.type === "MemberExpression") {
    const name = accessedName(context, expression);
    return INVOCATIONS.has(name ?? "") ? calledMember(context, expression.object, depth + 1) : { object: expression.object, name };
  }
  if (expression.type === "CallExpression" && expression.callee.type === "MemberExpression" && accessedName(context, expression.callee) === "bind") {
    return calledMember(context, expression.callee.object, depth + 1);
  }
  return undefined;
}

function effectiveArguments(context: OrbRuleContext, call: TSESTree.CallExpression, depth = 0): readonly TSESTree.Node[] {
  const callee = resolved(context, call.callee);
  if (callee.type === "MemberExpression") {
    const method = accessedName(context, callee);
    if (method === "call") {
      return call.arguments.slice(1);
    }
    const applied = call.arguments[1];
    if (method === "apply" && applied?.type === "ArrayExpression") {
      return applied.elements.filter((element): element is Exclude<typeof element, null> => element !== null);
    }
  }
  if (
    depth < STATIC_CONST_DEPTH &&
    callee.type === "CallExpression" &&
    callee.callee.type === "MemberExpression" &&
    accessedName(context, callee.callee) === "bind"
  ) {
    return [...effectiveArguments(context, callee, depth + 1).slice(1), ...call.arguments];
  }
  return call.arguments;
}

type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

function functionName(node: FunctionNode): string | undefined {
  if (node.type !== "ArrowFunctionExpression" && node.id !== null) {
    return node.id.name;
  }
  const parent = node.parent;
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return parent.id.name;
  }
  return parent.type === "Property" && parent.key.type === "Identifier" ? parent.key.name : undefined;
}

function functionPath(node: TSESTree.Node): string {
  const names: string[] = [];
  for (let current: TSESTree.Node | undefined | null = node.parent; current; current = current.parent) {
    if (current.type === "ArrowFunctionExpression" || current.type === "FunctionExpression" || current.type === "FunctionDeclaration") {
      const name = functionName(current);
      if (name !== undefined) {
        names.unshift(name);
      }
    }
  }
  return names.join("/") || "<module>";
}

/** A named DOM boundary permits only its reviewed call expression, never other calls in the file. */
export interface DomLookupHome {
  readonly file: string;
  readonly function: string;
  readonly method: string;
  readonly receiver: string;
  readonly selector: string;
  readonly reason: string;
}

const expressionPrinter = ts.createPrinter({ removeComments: true });

function normalizedExpression(context: OrbRuleContext, node: TSESTree.Node): string {
  const text = context.sourceCode.getText(unwrapTsValue(node));
  const source = ts.createSourceFile("dom-selector.ts", `(${text})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statement = source.statements[0];
  if (statement === undefined || !ts.isExpressionStatement(statement)) {
    throw new Error("The DOM selector expression did not parse");
  }
  return expressionPrinter.printNode(ts.EmitHint.Expression, statement.expression, source);
}

type LookupSite = Pick<DomLookupHome, "function" | "receiver" | "method" | "selector">;
const siteIdentity = (site: LookupSite): string => JSON.stringify([site.function, site.receiver, site.method, site.selector]);

function lookupSite(context: OrbRuleContext, call: TSESTree.CallExpression): LookupSite | undefined {
  const member = calledMember(context, call.callee);
  if (member === undefined) {
    return undefined;
  }
  const method = member.name;
  if (method === undefined || !LOOKUPS.has(method)) {
    return undefined;
  }
  const argument = effectiveArguments(context, call)[0];
  const value = argument === undefined ? undefined : staticTextValue(context, argument);
  if (method === "closest" && value === "[inert]") {
    return undefined;
  }
  const selector = argument === undefined ? "" : String(value ?? normalizedExpression(context, argument));
  return { function: functionPath(call), receiver: context.sourceCode.getText(member.object).replaceAll(/\s+/gu, ""), method, selector };
}

export const domLookupRule = (homes: readonly DomLookupHome[]): OrbRule => ({
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const unused = homes.filter((home) => context.filename.endsWith(`/${home.file}`));
    if (new Set(unused.map(siteIdentity)).size !== unused.length) {
      throw new Error(`Duplicate DOM home in ${context.filename}`);
    }
    return {
      ["CallExpression"]: (call: TSESTree.CallExpression): void => {
        const site = lookupSite(context, call);
        if (site === undefined) {
          return;
        }
        const approved = unused.findIndex((home) => siteIdentity(home) === siteIdentity(site));
        if (approved >= 0) {
          unused.splice(approved, 1);
          return;
        }
        context.report({
          node: call,
          message:
            "DOM addressing belongs to a named boundary call. Hold owned nodes with refs or expose a part handle; new boundary calls require a reason in eslint.config.ts.",
        });
      },
      "Program:exit"(program: TSESTree.Program): void {
        for (const home of unused) {
          context.report({ node: program, message: `Stale DOM home: ${home.function} ${home.method} ${home.selector}` });
        }
      },
    };
  },
});

function classList(context: OrbRuleContext, node: TSESTree.Node): boolean {
  const expression = resolved(context, node);
  return calledMember(context, expression)?.name === "classList";
}

export const classListWriteRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const report = (node: TSESTree.Node): void =>
      context.report({ node, message: "State styling uses a data attribute or an @orb/ui prop, not an imperative class write." });
    return {
      ["CallExpression"]: (call: TSESTree.CallExpression): void => {
        const member = calledMember(context, call.callee);
        if (member === undefined) {
          return;
        }
        const name = member.name;
        const attribute = effectiveArguments(context, call)[0];
        if (
          (CLASS_WRITES.has(name ?? "") && classList(context, member.object)) ||
          (name === "setAttribute" && attribute !== undefined && staticTextValue(context, attribute) === "class")
        ) {
          report(call);
        }
      },
      AssignmentExpression: (node: TSESTree.AssignmentExpression): void => {
        if (node.left.type !== "MemberExpression") {
          return;
        }
        const name = accessedName(context, node.left);
        if (name === "className" || (name === "value" && classList(context, node.left.object))) {
          report(node);
        }
      },
    };
  },
};
