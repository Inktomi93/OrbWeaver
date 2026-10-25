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

/** How a file reaches React's exports: through a namespace (`import * as R`, `import R`) or by a bound name. */
interface ReactBindings {
  readonly namespaces: Set<string>;
  /** Local name to the React export it holds. */
  readonly names: Map<string, string>;
}

// `React` without an import is the global the JSX runtime leaves in scope, so it counts as a namespace too.
function reactBindings(context: OrbRuleContext): ReactBindings {
  const bindings: ReactBindings = { namespaces: new Set(["React"]), names: new Map() };
  for (const statement of context.sourceCode.ast.body) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== "react") {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        bindings.names.set(specifier.local.name, importedName(specifier));
      } else {
        bindings.namespaces.add(specifier.local.name);
      }
    }
  }
  return bindings;
}

/** The React export a `Namespace.name` member reads, or undefined for any other member. */
function namespaceMember(node: TSESTree.MemberExpression, bindings: ReactBindings): string | undefined {
  return !node.computed && node.object.type === "Identifier" && bindings.namespaces.has(node.object.name) && node.property.type === "Identifier"
    ? node.property.name
    : undefined;
}

/** The `{ key: local }` pairs of `const { key: local } = Namespace`, or none for any other declarator. */
function destructuredFromNamespace(node: TSESTree.VariableDeclarator, bindings: ReactBindings): { property: TSESTree.Property; key: string; local: string }[] {
  if (node.id.type !== "ObjectPattern" || node.init?.type !== "Identifier" || !bindings.namespaces.has(node.init.name)) {
    return [];
  }
  return node.id.properties.flatMap((property) =>
    property.type === "Property" && property.key.type === "Identifier" && property.value.type === "Identifier"
      ? [{ property, key: property.key.name, local: property.value.name }]
      : [],
  );
}

/** The React export a callee names: a bound name, a `Namespace.name` member, or neither. */
function reactExportCalled(callee: TSESTree.Expression, bindings: ReactBindings): string | undefined {
  if (callee.type === "Identifier") {
    return bindings.names.get(callee.name);
  }
  return callee.type === "MemberExpression" ? namespaceMember(callee, bindings) : undefined;
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
    const bindings = reactBindings(context);
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
      "MemberExpression:exit"(node: TSESTree.MemberExpression): void {
        const member = namespaceMember(node, bindings);
        if (member !== undefined && MEMO_APIS.has(member)) {
          context.report({ node, message: MEMO_MESSAGE });
        }
      },
      "VariableDeclarator:exit"(node: TSESTree.VariableDeclarator): void {
        for (const { property, key } of destructuredFromNamespace(node, bindings)) {
          if (MEMO_APIS.has(key)) {
            context.report({ node: property, message: MEMO_MESSAGE });
          }
        }
      },
    };
  },
};

const USE_MESSAGE =
  "`use()` on a promise: useSuspenseQuery / useSuspenseQueries own suspend-on-async, and a hand-made promise skips Query's cache and invalidation (UI-Architecture-and-Layout.md §4a). `use(Context)` stays legal.";

/**
 * `use(x)` where x's type is a thenable. Types decide it because the only other legal argument, a Context, has no
 * `then`; a name test would pass a promise called `FooContext`. An `any` argument has no known `then` and passes.
 * `use` is found as an import, a `Namespace.use` member or a name destructured from the namespace.
 */
export const noUsePromiseRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const bindings = reactBindings(context);
    const services = context.sourceCode.parserServices;
    if (services?.program === undefined || services.program === null || services.esTreeNodeToTSNodeMap === undefined) {
      throw new Error("no-use-promise needs the parser's TypeScript Program to read the argument's type");
    }
    const checker = services.program.getTypeChecker();
    const toTsNode = services.esTreeNodeToTSNodeMap;
    return {
      "VariableDeclarator:exit"(node: TSESTree.VariableDeclarator): void {
        for (const { key, local } of destructuredFromNamespace(node, bindings)) {
          bindings.names.set(local, key);
        }
      },
      "CallExpression:exit"(node: TSESTree.CallExpression): void {
        const { callee } = node;
        const reached = reactExportCalled(callee, bindings);
        const argument = node.arguments[0];
        if (reached !== "use" || argument === undefined) {
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
