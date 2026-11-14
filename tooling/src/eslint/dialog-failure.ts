// A dialog's failure line is the `#components` `DialogFailure`; this rule refuses an element spelled `role="alert"` anywhere a
// dialog draws it inside one file. A dialog is an element of an imported dialog composite or part (`FormDialog`, `FormDialogRoot`,
// `FormDialogPopup`, `PickerDialog`, `DismissDialog`, `ConfirmDialog`, ...), with its props and children, or a declaration typed by
// a modal's `ModalCommit` (or a local alias of it), whose content the host's dialog draws. From each of those the rule follows the
// local components rendered and the local functions called, so a body component such as a picker list is covered. A line beside the
// dialog element, such as a refusal shown instead of the dialog, is not the dialog's.
// It reads one file: a body imported from another module, or JSX held in a variable outside the dialog element, is not followed.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const MESSAGE =
  "A hand-spelled alert line in a dialog: a dialog's failure line is the `#components` `DialogFailure`, which reads at the body step like the dialog's description.";

// An imported element with this name is a dialog composite or one of its parts.
const DIALOG_ELEMENT = /Dialog(?:Root|Popup)?$/u;
const COMMIT_TYPE = "ModalCommit";

// The statement directly under the program (through an `export`) that holds a node: the unit this rule follows.
type TopLevel = TSESTree.ProgramStatement;
interface TypeReference {
  readonly name: string;
  readonly range: TSESTree.Range;
}

function declarationOf(statement: TopLevel): TSESTree.Node | null | undefined {
  return statement.type === AST_NODE_TYPES.ExportNamedDeclaration || statement.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ? statement.declaration
    : statement;
}

function declaredNames(statement: TopLevel): readonly string[] {
  const inner = declarationOf(statement);
  if (inner?.type === AST_NODE_TYPES.FunctionDeclaration || inner?.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
    return inner.id === null ? [] : [inner.id.name];
  }
  if (inner?.type === AST_NODE_TYPES.VariableDeclaration) {
    return inner.declarations.flatMap((declarator) => (declarator.id.type === AST_NODE_TYPES.Identifier ? [declarator.id.name] : []));
  }
  return [];
}

// The types a top-level unit declares itself as: a function's return type, a variable's type or its function's return type.
function ownAnnotations(statement: TopLevel): readonly TSESTree.Node[] {
  const inner = declarationOf(statement);
  if (inner?.type === AST_NODE_TYPES.FunctionDeclaration) {
    return inner.returnType === undefined ? [] : [inner.returnType];
  }
  if (inner?.type !== AST_NODE_TYPES.VariableDeclaration) {
    return [];
  }
  return inner.declarations.flatMap((declarator) => {
    const init = declarator.init;
    const isFunction = init?.type === AST_NODE_TYPES.ArrowFunctionExpression || init?.type === AST_NODE_TYPES.FunctionExpression;
    return [declarator.id.typeAnnotation, isFunction ? init.returnType : undefined].filter((annotation) => annotation !== undefined);
  });
}

const within = (inner: TSESTree.Range, outer: TSESTree.Range): boolean => inner[0] >= outer[0] && inner[1] <= outer[1];
const namesWithin = (node: TSESTree.Node, references: readonly TypeReference[]): readonly string[] =>
  references.filter(({ range }) => within(range, node.range)).map(({ name }) => name);

// `ModalCommit` and every local alias that refers to it, through any chain of aliases.
function commitTypes(program: TSESTree.Program, imported: ReadonlySet<string>, references: readonly TypeReference[]): ReadonlySet<string> {
  const found = new Set(imported.has(COMMIT_TYPE) ? [COMMIT_TYPE] : []);
  const aliases = program.body.flatMap((statement) => {
    const inner = declarationOf(statement);
    return inner?.type === AST_NODE_TYPES.TSTypeAliasDeclaration ? [{ name: inner.id.name, refs: namesWithin(inner.typeAnnotation, references) }] : [];
  });
  for (let before = -1; found.size > 0 && found.size !== before; ) {
    before = found.size;
    for (const { name, refs } of aliases) {
      if (refs.some((ref) => found.has(ref))) {
        found.add(name);
      }
    }
  }
  return found;
}

// The units the roots draw: each root, and every local unit a reached unit renders or calls.
function reachable(
  roots: readonly TSESTree.Node[],
  uses: ReadonlyMap<TSESTree.Node, ReadonlySet<string>>,
  byName: ReadonlyMap<string, TSESTree.Node>,
): ReadonlySet<TSESTree.Node> {
  const reached = new Set<TSESTree.Node>();
  const queue = [...roots];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (!reached.has(next)) {
      reached.add(next);
      queue.push(...[...(uses.get(next) ?? [])].flatMap((name) => byName.get(name) ?? []));
    }
  }
  return reached;
}

/** Refuses `role="alert"` inside a dialog element, in a commit, and in the local components and functions they reach. */
export const dialogFailureViaOwnerRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const imported = new Set<string>();
    const typeReferences: TypeReference[] = [];
    const dialogs: TSESTree.Range[] = [];
    // Each name a unit renders or calls and each alert, with the top-level statement that holds it.
    const uses: { readonly owner: TSESTree.Node; readonly name: string; readonly range: TSESTree.Range }[] = [];
    const alerts: { readonly owner: TSESTree.Node; readonly node: TSESTree.JSXAttribute }[] = [];

    const topLevel = (node: TSESTree.Node): TSESTree.Node | undefined =>
      context.sourceCode.getAncestors(node).find((ancestor) => ancestor.parent?.type === AST_NODE_TYPES.Program);
    const use = (node: TSESTree.Node, name: string): void => {
      const owner = topLevel(node);
      if (owner !== undefined) {
        uses.push({ owner, name, range: node.range });
      }
    };

    return {
      "ImportSpecifier, ImportDefaultSpecifier": (node: TSESTree.ImportSpecifier | TSESTree.ImportDefaultSpecifier): void => {
        imported.add(node.local.name);
      },
      TSTypeReference: (node: TSESTree.TSTypeReference): void => {
        if (node.typeName.type === AST_NODE_TYPES.Identifier) {
          typeReferences.push({ name: node.typeName.name, range: node.range });
        }
      },
      JSXElement: (node: TSESTree.JSXElement): void => {
        const { name } = node.openingElement;
        if (name.type === AST_NODE_TYPES.JSXIdentifier && imported.has(name.name) && DIALOG_ELEMENT.test(name.name)) {
          dialogs.push(node.range);
        }
      },
      JSXOpeningElement: (node: TSESTree.JSXOpeningElement): void => {
        if (node.name.type === AST_NODE_TYPES.JSXIdentifier) {
          use(node, node.name.name);
        }
      },
      CallExpression: (node: TSESTree.CallExpression): void => {
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          use(node, node.callee.name);
        }
      },
      JSXAttribute: (node: TSESTree.JSXAttribute): void => {
        const value = node.value?.type === AST_NODE_TYPES.JSXExpressionContainer ? node.value.expression : node.value;
        const owner = topLevel(node);
        if (owner !== undefined && node.name.name === "role" && value?.type === AST_NODE_TYPES.Literal && value.value === "alert") {
          alerts.push({ owner, node });
        }
      },
      "Program:exit": (program: TSESTree.Program): void => {
        const byName = new Map(program.body.flatMap((statement) => declaredNames(statement).map((name) => [name, statement] as const)));
        const commits = commitTypes(program, imported, typeReferences);
        const typedAsCommit = (statement: TopLevel): boolean =>
          ownAnnotations(statement).some((annotation) => namesWithin(annotation, typeReferences).some((name) => commits.has(name)));
        const inDialog = (range: TSESTree.Range): boolean => dialogs.some((dialog) => within(range, dialog));
        const usesByOwner = new Map<TSESTree.Node, Set<string>>();
        for (const { owner, name } of uses) {
          usesByOwner.set(owner, (usesByOwner.get(owner) ?? new Set<string>()).add(name));
        }
        const drawnByDialogs = uses.filter(({ range }) => inDialog(range)).flatMap(({ name }) => byName.get(name) ?? []);
        const reached = reachable([...drawnByDialogs, ...program.body.filter(typedAsCommit)], usesByOwner, byName);
        for (const { owner, node } of alerts) {
          if (inDialog(node.range) || reached.has(owner)) {
            context.report({ node, message: MESSAGE });
          }
        }
      },
    };
  },
};
