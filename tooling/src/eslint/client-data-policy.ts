import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { alternation } from "./syntax.ts";

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

/** Hooks that read a shared selection pointer: the `*-selection-store` verbs and the active-chat pointer. */
const SELECTION_POINTER_HOOK = /^use(?:Selected\w+|Drilled\w+|ActiveChat(?:Id|Handle))$/u;

const EFFECT_HOOK = /^use(?:Layout)?Effect$/u;

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

function readsSelectionPointer(variable: TSESLint.Scope.Variable): boolean {
  return variable.defs.some((def) => {
    const init = def.type === "Variable" ? def.node.init : null;
    return init?.type === "CallExpression" && init.callee.type === "Identifier" && SELECTION_POINTER_HOOK.test(init.callee.name);
  });
}

function effectDependencies(node: TSESTree.CallExpression): readonly (TSESTree.Node | null)[] {
  const callee = node.callee.type === "MemberExpression" && !node.callee.computed ? node.callee.property : node.callee;
  const dependencies = node.arguments[1];
  return callee.type === "Identifier" && EFFECT_HOOK.test(callee.name) && dependencies?.type === "ArrayExpression" ? dependencies.elements : [];
}

function selectionDependency(element: TSESTree.Node | null, context: OrbRuleContext): TSESTree.Identifier | undefined {
  const root = element === null ? undefined : dependencyRoot(element);
  const variable = root === undefined ? undefined : variableNamed(context.sourceCode.getScope(root), root.name);
  return variable !== undefined && readsSelectionPointer(variable) ? root : undefined;
}

/**
 * An effect whose dependency list names a value read straight from a shared selection hook. Reading the
 * pointer in render and deriving from it is the sanctioned shape (ui-architecture-state-and-stack.md §5.1).
 * Limit: a value derived from the pointer first (`const key = id ?? ""`) is not followed.
 */
export const effectOnSharedSelectionRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "CallExpression:exit"(node: TSESTree.CallExpression): void {
        for (const element of effectDependencies(node)) {
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
