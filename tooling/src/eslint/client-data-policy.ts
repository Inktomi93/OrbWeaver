import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { importedSymbol } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { alternation, wholeModule } from "./syntax.ts";

// Gates for the client data, state and registry law (client-architecture-state-and-gates.md §9-§10,
// ui-architecture-state-and-stack.md §5.1-§6.1, client-architecture-lockdown.md §6d/§8). Each entry is one
// `orb/<id>` rule; eslint.config.ts scopes it and names every sanctioned home with its reason.

const callOf = (names: readonly string[]): string =>
  `CallExpression:matches([callee.property.name=${alternation(names)}], [callee.property.value=${alternation(names)}])`;

const STORAGE_NAMES = ["localStorage", "sessionStorage", "indexedDB"];

// A value-declared definition: `const x: ModalDefinition = …`. Keyed on the annotation because every definition in the
// tree is authored that way, and an annotation is what the registry's `Def` type is checked through.
const declaredAs = (typeName: string): string => `VariableDeclarator[id.typeAnnotation.typeAnnotation.typeName.name='${typeName}']`;

export const CLIENT_DATA_RESTRICTIONS = [
  {
    id: "persistence-boundary",
    globals: STORAGE_NAMES.map((name) => ({
      name,
      message: `A bare \`${name}\` read: durable device state goes through createPersistedStore / createEntityDraftStore, which namespace the key per user (client-architecture-state-and-gates.md §9, §10a).`,
    })),
    selectors: [
      {
        selector: `MemberExpression:matches([property.name=${alternation(STORAGE_NAMES)}], [property.value=${alternation(STORAGE_NAMES)}])`,
        message:
          "Raw browser storage outside the store doors: durable device state goes through createPersistedStore / createEntityDraftStore, which namespace the key per user (client-architecture-state-and-gates.md §9, §10a). A tab-scoped or pre-auth key needs its own named home in eslint.config.ts.",
      },
    ],
  },
  {
    id: "client-cache-surgery-only-in-data",
    selectors: [
      {
        selector: callOf(["invalidateQueries", "refetchQueries", "resetQueries", "setQueryData", "setQueriesData", "removeQueries", "cancelQueries"]),
        message:
          "Imperative QueryClient surgery outside data/: a cache need lands in createEntityMutation or the invalidation seam (ui-architecture-state-and-stack.md §6.1).",
      },
    ],
  },
  {
    id: "no-inline-invalidate-outside-seam",
    selectors: [
      {
        selector: callOf(["invalidateQueries", "refetchQueries", "resetQueries"]),
        message:
          "Cache invalidation outside data/invalidation.ts: route the event through the seam's `invalidate(event)` / `invalidateFilters` (ui-package-design.md §6.2).",
      },
    ],
  },
  {
    id: "mutation-only-in-factory",
    selectors: [
      {
        selector: "ImportDeclaration[source.value='@tanstack/react-query'] > ImportSpecifier[imported.name='useMutation']",
        message:
          "`useMutation` belongs only in data/create-entity-mutation.ts; it bakes the one error slot, the optimistic recipe and the freshness XOR (client-architecture-state-and-gates.md §11, §14).",
      },
      {
        selector: "ExportNamedDeclaration[source.value='@tanstack/react-query'] > ExportSpecifier[local.name='useMutation']",
        message: "`useMutation` re-exported outside data/create-entity-mutation.ts (client-architecture-state-and-gates.md §11, §14).",
      },
      {
        selector: wholeModule("@tanstack/react-query"),
        message:
          "The whole `@tanstack/react-query` module taken by namespace, `export *` or dynamic import outside data/create-entity-mutation.ts: import the hooks you need by name, so a raw `useMutation` stays visible (client-architecture-state-and-gates.md §11, §14).",
      },
    ],
  },
  {
    id: "modal-definition-home",
    selectors: [
      {
        selector: `${declaredAs("ModalDefinition")}, TSSatisfiesExpression[typeAnnotation.typeName.name='ModalDefinition']`,
        message: "A ModalDefinition is authored in its owning feature's lib/ and assembled at the door (client-architecture-lockdown.md §6d).",
      },
    ],
  },
  {
    id: "modal-definition-literal",
    selectors: [
      {
        selector: `${declaredAs("ModalDefinition")}:not([init.type='ObjectExpression'])`,
        message:
          "A ModalDefinition is one object literal, so its trigger and body arm are readable where the door assembles it (client-architecture-lockdown.md §6d).",
      },
    ],
  },
  {
    id: "config-group-definition-home",
    selectors: [
      {
        selector: `${declaredAs("ConfigGroupDefinition")}, TSSatisfiesExpression[typeAnnotation.typeName.name='ConfigGroupDefinition']`,
        message: "A ConfigGroupDefinition is authored in its owning feature's lib/ and assembled at the door (client-architecture-lockdown.md §8).",
      },
    ],
  },
];

/** The files whose exports are shared selection pointers: every `*-selection-store` and the active-chat pointer. */
const POINTER_STORE_FILE = /\/state\/(?:[\w-]+-selection-store|active-chat-store)\.ts$/u;

/**
 * The shell store mixes selection pointers with device and transient state (viewport regime, context tab), so
 * only its named pointer hooks count: the active section and the open modal (ui-architecture-state-and-stack.md §5.1).
 */
const SHELL_STORE_FILE = /\/state\/shell-store\.ts$/u;
const SHELL_POINTER_HOOKS: ReadonlySet<string> = new Set(["useActiveSection", "useOpenModal"]);

const EFFECT_HOOK = /^use(?:Layout)?Effect$/u;

const HOOK_NAME = /^use[A-Z]/u;

function variableNamed(scope: TSESLint.Scope.Scope | null, name: string): TSESLint.Scope.Variable | undefined {
  for (let current = scope; current !== null; current = current.upper) {
    const found = current.set.get(name);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function dependencyRoot(element: TSESTree.Node): TSESTree.Identifier | undefined {
  let node = element;
  while (node.type === "MemberExpression" || node.type === "ChainExpression") {
    node = node.type === "ChainExpression" ? node.expression : node.object;
  }
  return node.type === "Identifier" ? node : undefined;
}

function resolvedSymbol(symbol: ts.Symbol | undefined, checker: ts.TypeChecker): ts.Symbol | undefined {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

function functionBody(declaration: ts.Declaration): ts.Node | undefined {
  if (ts.isFunctionDeclaration(declaration)) {
    return declaration.body;
  }
  const init = ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
  return init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init.body : undefined;
}

function callsPointerHook(node: ts.Node, checker: ts.TypeChecker): boolean {
  if (ts.isCallExpression(node) && declaredInPointerStore(checker.getSymbolAtLocation(node.expression), checker, false)) {
    return true;
  }
  return ts.forEachChild(node, (child) => (callsPointerHook(child, checker) ? true : undefined)) ?? false;
}

/** A symbol is a pointer hook when its declaration lives in a pointer store file, or (one hop) its body calls one. */
function declaredInPointerStore(symbol: ts.Symbol | undefined, checker: ts.TypeChecker, followWrappers: boolean): boolean {
  const target = resolvedSymbol(symbol, checker);
  const declarations = target === undefined || !HOOK_NAME.test(target.name) ? [] : (target.declarations ?? []);
  const isPointerFile = (file: string): boolean =>
    POINTER_STORE_FILE.test(file) || (SHELL_STORE_FILE.test(file) && SHELL_POINTER_HOOKS.has(target?.name ?? ""));
  if (declarations.some((declaration) => isPointerFile(declaration.getSourceFile().fileName))) {
    return true;
  }
  return followWrappers && declarations.some((declaration) => functionBody(declaration) !== undefined && callsPointerHook(declaration, checker));
}

type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

function functionNameOf(node: FunctionNode): TSESTree.Identifier | undefined {
  if (node.type === "FunctionDeclaration") {
    return node.id ?? undefined;
  }
  return node.parent.type === "VariableDeclarator" && node.parent.id.type === "Identifier" ? node.parent.id : undefined;
}

function pointerThroughParameter(variable: TSESLint.Scope.Variable, context: OrbRuleContext): boolean {
  return variable.defs.some((def) => {
    if (def.type !== "Parameter") {
      return false;
    }
    const owner = def.node as FunctionNode;
    const index = owner.params.indexOf(def.name as TSESTree.Parameter);
    const name = functionNameOf(owner);
    const callee = name === undefined ? undefined : variableNamed(context.sourceCode.getScope(name), name.name);
    return (
      index >= 0 &&
      (callee?.references ?? []).some(({ identifier }) => {
        const call = identifier.parent;
        const argument = call.type === "CallExpression" && call.callee === identifier ? call.arguments[index] : undefined;
        const passed = argument?.type === "Identifier" ? variableNamed(context.sourceCode.getScope(argument), argument.name) : undefined;
        return passed !== undefined && readsSelectionPointer(passed, context, false);
      })
    );
  });
}

function readsSelectionPointer(variable: TSESLint.Scope.Variable, context: OrbRuleContext, followParameters: boolean): boolean {
  const services = context.sourceCode.parserServices;
  if (services?.program === undefined || services.program === null || services.esTreeNodeToTSNodeMap === undefined) {
    throw new Error("no-effect-on-shared-selection needs the parser's TypeScript Program to resolve a hook to its declaring file");
  }
  const checker = services.program.getTypeChecker();
  const toTsNode = services.esTreeNodeToTSNodeMap;
  const direct = variable.defs.some((def) => {
    const init = def.type === "Variable" ? def.node.init : null;
    return init?.type === "CallExpression" && declaredInPointerStore(checker.getSymbolAtLocation(toTsNode.get(init.callee)), checker, true);
  });
  return direct || (followParameters && pointerThroughParameter(variable, context));
}

/** A React import is judged by the name it imports, so `import { useEffect as run }` is still an effect; any other callee by its own name. */
function effectName(callee: TSESTree.CallExpression["callee"], context: OrbRuleContext): string | undefined {
  if (callee.type === "MemberExpression") {
    return !callee.computed && callee.property.type === "Identifier" ? callee.property.name : undefined;
  }
  if (callee.type !== "Identifier") {
    return;
  }
  const imported = importedSymbol(context, callee);
  return imported?.source === "react" ? imported.name : callee.name;
}

function effectDependencies(node: TSESTree.CallExpression, context: OrbRuleContext): readonly (TSESTree.Node | null)[] {
  const dependencies = node.arguments[1];
  // The dependency list is the cheap test; the import lookup runs only for a call that has one.
  if (dependencies?.type !== "ArrayExpression") {
    return [];
  }
  const name = effectName(node.callee, context);
  return name !== undefined && EFFECT_HOOK.test(name) ? dependencies.elements : [];
}

function selectionDependency(element: TSESTree.Node | null, context: OrbRuleContext): TSESTree.Identifier | undefined {
  const root = element === null ? undefined : dependencyRoot(element);
  const variable = root === undefined ? undefined : variableNamed(context.sourceCode.getScope(root), root.name);
  return variable !== undefined && readsSelectionPointer(variable, context, true) ? root : undefined;
}

/**
 * An effect whose dependency list names a value read straight from a shared selection hook: a hook declared
 * in a pointer store file (or a named shell-store pointer hook), or a hook whose body calls one. Reading the pointer in render and deriving from it
 * is the sanctioned shape (ui-architecture-state-and-stack.md §5.1).
 * A parameter counts when a call site in the same file passes it a value read straight from such a hook.
 * Limit: a value derived from the pointer first (`const key = id ?? ""`), or handed down through a prop or an
 * argument in another file, is not followed.
 */
export const effectOnSharedSelectionRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "CallExpression:exit"(node: TSESTree.CallExpression): void {
        for (const element of effectDependencies(node, context)) {
          const root = selectionDependency(element, context);
          if (root !== undefined) {
            context.report({
              node: root,
              message: `An effect keyed on \`${root.name}\`, a shared selection pointer: "do X when the selection changes" is a render derivation, not an effect (ui-architecture-state-and-stack.md §5.1).`,
            });
          }
        }
      },
    };
  },
};
