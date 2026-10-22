import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { contextLiteral } from "./static-values.ts";
import type { OrbRule, OrbRuleContext, Source } from "./syntax.ts";

const CT_COLOR_LINE = /(?:oklch|\brgba?)\\?\((?=[^)\n]*\d)|#[0-9a-fA-F]{3,8}\b/u;

const CT_NARRATION_CALLEES = new Set(["test", "it", "describe", "suite", "bench"]);

const calleeRoot = (callee: TSESTree.Node): string | undefined => {
  let node = callee;
  while (node.type === "MemberExpression" && !node.computed) {
    node = node.object;
  }
  return node.type === "Identifier" ? node.name : undefined;
};

const narrationArgIndex = (root: string | undefined): 1 | 0 | -1 => {
  if (root === "expect") {
    return 1;
  }
  return CT_NARRATION_CALLEES.has(root as string) ? 0 : -1;
};

export const uiCtColorRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { sourceCode } = context;
    const blanked = sourceCode.getAllComments().map(({ range }) => range);
    return {
      "CallExpression[arguments.length>0]"(
        call: TSESTree.CallExpression & { callee: TSESTree.MemberExpression & { computed: false; property: TSESTree.Identifier } },
      ): void {
        const arg = call.arguments[narrationArgIndex(calleeRoot(call.callee))];
        if (arg?.type === "Literal" && typeof arg.value === "string") {
          blanked.push(arg.range);
        } else if (arg?.type === "TemplateLiteral") {
          blanked.push(...arg.quasis.map(({ range }) => range));
        }
      },
      "Program:exit"(): void {
        let text = sourceCode.text;
        for (const [start, end] of blanked) {
          text = text.slice(0, start) + text.slice(start, end).replace(/[^\r\n]/gu, " ") + text.slice(end);
        }
        text.split(/\r?\n/u).forEach((line, index) => {
          const column = line.search(CT_COLOR_LINE);
          if (column >= 0) {
            context.report({ loc: { line: index + 1, column }, message: "A hardcoded color in a CT: assert colors through TOKENS." });
          }
        });
      },
    };
  },
};

export const typedTestIdRule = (message: string): OrbRule => ({
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "JSXAttribute[name.type='JSXIdentifier'][name.name='data-testid']"(node: TSESTree.JSXAttribute): void {
        const value = node.value;
        const literal = value?.type === "Literal" && typeof value.value === "string";
        if (literal || (value?.type === "JSXExpressionContainer" && contextLiteral(value.expression) !== undefined)) {
          context.report({ node: node.name, message });
        }
      },
    };
  },
});

const POLL_SCHEDULE_MESSAGE =
  "A poll `intervals` schedule shared by identifier is drained by the first poll; mint it inline (`intervals: [50, 100]`) or from a factory call such as evidencePoll().";

function moduleScopeIntervalsObject(sourceCode: Source, identifier: TSESTree.Identifier): boolean {
  for (let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable === undefined) {
      continue;
    }
    const [definition] = variable.defs;
    const init = variable.defs.length === 1 && definition?.type === "Variable" ? definition.node.init : null;
    return (
      (scope.type === "module" || scope.type === "global") &&
      init?.type === "ObjectExpression" &&
      init.properties.some(
        (property) => property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "intervals",
      )
    );
  }
  return false;
}

export const ctPollIntervalsSharedRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const report = (node: TSESTree.Node) => context.report({ node, message: POLL_SCHEDULE_MESSAGE });
    const judgeProperty = (property: TSESTree.Property | TSESTree.SpreadElement) => {
      if (property.type === "SpreadElement") {
        if (property.argument.type === "Identifier" && moduleScopeIntervalsObject(context.sourceCode, property.argument)) {
          report(property.argument);
        }
      } else if (!property.computed && property.key.type === "Identifier" && property.key.name === "intervals") {
        if (property.shorthand) {
          report(property);
        } else if (property.value.type === "Identifier") {
          report(property.value);
        }
      }
    };
    const judgeOptions = (options: TSESTree.CallExpressionArgument | undefined) => {
      if (options?.type === "Identifier") {
        if (moduleScopeIntervalsObject(context.sourceCode, options)) {
          report(options);
        }
      } else if (options?.type === "ObjectExpression") {
        options.properties.forEach(judgeProperty);
      }
    };
    return {
      "CallExpression[callee.type='MemberExpression'][callee.computed=false][callee.property.type='Identifier']"(
        call: TSESTree.CallExpression & { callee: TSESTree.MemberExpression & { computed: false; property: TSESTree.Identifier } },
      ): void {
        const { callee } = call;
        if (callee.property.name === "toPass") {
          judgeOptions(call.arguments[0]);
        } else if (callee.property.name === "poll" && callee.object.type === "Identifier" && callee.object.name === "expect") {
          judgeOptions(call.arguments[1]);
        }
      },
    };
  },
};

const EVALUATE_METHODS = new Set(["evaluate", "evaluateAll"]);

export const FUNCTION_NODES = new Set(["FunctionDeclaration", "ArrowFunctionExpression", "FunctionExpression"]);

function evaluateMethodName(callee: TSESTree.Node): string {
  if (callee.type !== "MemberExpression") {
    return "";
  }
  if (callee.computed) {
    return callee.property.type === "Literal" ? String(callee.property.value) : "";
  }
  return callee.property.type === "Identifier" ? callee.property.name : "";
}

function isModuleScoped(scope: TSESLint.Scope.Scope): boolean {
  for (let current: TSESLint.Scope.Scope | null = scope; current !== null; current = current.upper) {
    if (current.type === "function" || current.type === "function-expression-name") {
      return false;
    }
  }
  return true;
}

function isModuleCapture(reference: TSESLint.Scope.Reference, self: TSESLint.Scope.Variable | null | undefined): boolean {
  const variable = reference.resolved;
  return variable !== null && variable !== self && variable.defs.length > 0 && reference.isValueReference && isModuleScoped(variable.scope);
}

export const evaluateNoScopeCaptureRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const sourceCode = context.sourceCode;
    const callbacks: TSESTree.CallExpressionArgument[] = [];
    const lookup = (from: TSESLint.Scope.Scope, name: string) => {
      let scope: TSESLint.Scope.Scope | null = from;
      while (scope !== null && !scope.set.has(name)) {
        scope = scope.upper;
      }
      return scope?.set.get(name);
    };
    const captureWithin = (fn: TSESTree.Node, self: TSESLint.Scope.Variable | null | undefined) => {
      for (const reference of sourceCode.getScope(fn).through.filter((candidate) => isModuleCapture(candidate, self))) {
        if (!sourceCode.getAncestors(reference.identifier).some(({ type }) => type === "TSTypeQuery")) {
          context.report({
            node: reference.identifier,
            message: `The .evaluate() callback references the module-scope binding \`${(reference.resolved as TSESLint.Scope.Variable).name}\`, which does not exist in the page. Thread it through the evaluate argument or move it inside the callback.`,
          });
        }
      }
    };
    // A callback imported from another module is out of per-file reach: its declaring file is not parsed here, and an
    // import binding may as well be a script string. Only a callback declared in this file is judged.
    const judgeReference = (arg: TSESTree.Identifier) => {
      const variable = lookup(sourceCode.getScope(arg), arg.name);
      for (const def of variable?.defs ?? []) {
        const fn = def.type === "FunctionName" ? def.node : (def.node as TSESTree.VariableDeclarator).init;
        if (FUNCTION_NODES.has(fn?.type as string)) {
          captureWithin(fn as TSESTree.Node, variable);
        }
      }
    };
    return {
      CallExpression: (node: TSESTree.CallExpression) => {
        const [arg] = node.arguments;
        if (arg !== undefined && EVALUATE_METHODS.has(evaluateMethodName(node.callee))) {
          callbacks.push(arg);
        }
      },
      "Program:exit"(): void {
        for (const arg of callbacks) {
          if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
            captureWithin(arg, null);
          } else if (arg.type === "Identifier") {
            judgeReference(arg);
          }
        }
      },
    };
  },
};
