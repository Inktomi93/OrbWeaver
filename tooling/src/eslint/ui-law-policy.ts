// Client and @orb/ui law gates that were review-only: manual memoization and `use()` on a thenable.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// The React Compiler skips any module that imports the virtualizer (the installed compiler's own denylist;
// tests/client/react-compiler-contract.test.ts fails when it stops). A file with that import keeps its manual memo.
const COMPILER_DENYLISTED_IMPORT = "@tanstack/react-virtual";
const MEMO_APIS = new Set(["useMemo", "useCallback", "memo"]);

const MEMO_MESSAGE =
  "Manual memoization: the React Compiler memoizes this file (UI-Architecture-and-Layout.md §4a). Delete it; only a file that imports @tanstack/react-virtual, which the compiler skips, may keep one.";

function importedName(specifier: TSESTree.ImportSpecifier): string {
  return specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
}

export const noManualMemoRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const skippedByCompiler = context.sourceCode.ast.body.some(
      (statement) => statement.type === "ImportDeclaration" && statement.source.value === COMPILER_DENYLISTED_IMPORT,
    );
    if (skippedByCompiler) {
      return {};
    }
    return {
      "ImportDeclaration:exit"(node: TSESTree.ImportDeclaration): void {
        if (node.source.value !== "react") {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier" && MEMO_APIS.has(importedName(specifier))) {
            context.report({ node: specifier, message: MEMO_MESSAGE });
          }
        }
      },
      "CallExpression:exit"(node: TSESTree.CallExpression): void {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.object.name === "React" &&
          callee.property.type === "Identifier" &&
          MEMO_APIS.has(callee.property.name)
        ) {
          context.report({ node: callee, message: MEMO_MESSAGE });
        }
      },
    };
  },
};

const USE_MESSAGE =
  "`use()` on a promise: useSuspenseQuery / useSuspenseQueries own suspend-on-async, and a hand-made promise skips Query's cache and invalidation (UI-Architecture-and-Layout.md §4a). `use(Context)` stays legal.";

/** Local names bound to React's `use`: `import { use }` and `import { use as read }`. */
function reactUseLocals(context: OrbRuleContext): ReadonlySet<string> {
  const locals = new Set<string>();
  for (const statement of context.sourceCode.ast.body) {
    if (statement.type === "ImportDeclaration" && statement.source.value === "react") {
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportSpecifier" && importedName(specifier) === "use") {
          locals.add(specifier.local.name);
        }
      }
    }
  }
  return locals;
}

/**
 * `use(x)` where x's type is a thenable. Types decide it because the only other legal argument, a Context, has no
 * `then`; a name test would pass a promise called `FooContext`. An `any` argument has no known `then` and passes.
 */
export const noUsePromiseRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const locals = reactUseLocals(context);
    const services = context.sourceCode.parserServices;
    if (services?.program === undefined || services.program === null || services.esTreeNodeToTSNodeMap === undefined) {
      throw new Error("no-use-promise needs the parser's TypeScript Program to read the argument's type");
    }
    const checker = services.program.getTypeChecker();
    const toTsNode = services.esTreeNodeToTSNodeMap;
    return {
      "CallExpression:exit"(node: TSESTree.CallExpression): void {
        const { callee } = node;
        const isReactUse =
          (callee.type === "Identifier" && locals.has(callee.name)) ||
          (callee.type === "MemberExpression" &&
            !callee.computed &&
            callee.object.type === "Identifier" &&
            callee.object.name === "React" &&
            callee.property.type === "Identifier" &&
            callee.property.name === "use");
        const argument = node.arguments[0];
        if (!isReactUse || argument === undefined) {
          return;
        }
        const type = checker.getTypeAtLocation(toTsNode.get(argument));
        const parts = type.isUnion() ? type.types : [type];
        if (parts.some((part) => part.getProperty("then") !== undefined)) {
          context.report({ node: argument, message: USE_MESSAGE });
        }
      },
    };
  },
};
