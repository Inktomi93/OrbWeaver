// A destructive control owns the trigger, reversible draft, inline choice or undo that makes its press safe (§14).
// A confirm another surface opens is proven by the press handler's type: a `ConfirmedAction`, which `orb/confirmed-action-mint`
// lets only a listed home mint and no cast forge. Without type information the rule never accepts that arm.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES as T, TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { lexicalVariable, singleInitializer } from "./general.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const ACTION = "JSXElement[openingElement.name.name=/^(Button|GlyphButton|InlineAction|MenuItem)$/]";
const VERB = String.raw`JSXText[value=/^\s*(Restore|Delete|Remove|Reset|Discard|Clear|Revert|Drop|Wipe|Erase|Overwrite|Replace)\b(?![^]*\b(search|filters?)\b)/i]`;
const TONE = "JSXOpeningElement:has(> JSXAttribute[name.name='tone'][value.value='destructive'])";
const CANDIDATE = `${ACTION}:matches(:has(> ${VERB}), :has(> ${TONE}))`;
const KEEP = String.raw`:matches(JSXText[value=/^\s*(Cancel|Keep)\s*$/], JSXExpressionContainer[expression.object.name='DIALOG_VERBS'][expression.property.name='cancel'])`;
const KEEP_CONTROL = `${ACTION}:has(> ${KEEP})`;
const KEEP_CLOSE = `JSXElement[openingElement.name.name=/^(Alert)?DialogClose$/]:has(${KEEP_CONTROL})`;
const TRIGGER = "JSXOpeningElement[name.name='DestructiveAction'] > JSXAttribute[name.name='trigger'] > JSXExpressionContainer > JSXElement";
const FOOTER = "JSXOpeningElement[name.name=/^(FormDialog|FormDialogPopup)$/] > JSXAttribute[name.name='footerLead'] > JSXExpressionContainer";
const DRAFT = "JSXElement[openingElement.name.name=/^(FormDialog|FormDialogPopup)$/] > :matches(JSXElement, JSXFragment, JSXExpressionContainer).children";
const DIALOG = "JSXOpeningElement[name.name=/^(ConfirmDialog|ModelRunConfirmDialog|FormDialog|FormDialogPopup|FlowDialog)$/]";
const UNDO =
  "CallExpression[callee.object.name='notify'] > ObjectExpression.arguments > Property[key.name='action'] > ObjectExpression:has(> Property[key.name='label'][value.value='Undo']):has(> Property[key.name='onClick'])";
const MESSAGE = "A control that destroys data needs its own confirmation or undo (docs/law/client-architecture-state-and-gates.md §14).";
export const CONFIRMED_HOME = /\/packages\/client\/src\/components\/confirmed-action\.ts$/u;
const CONFIRMED_TYPE = "ConfirmedAction";
// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
export const UNPROVEN = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never;
const confirmedCache = new WeakMap<ts.Program, ts.Type | null>();

/** The shipped `ConfirmedAction` brand in this program, or null when the program does not hold its module. */
export function confirmedType(program: ts.Program, checker: ts.TypeChecker): ts.Type | null {
  const cached = confirmedCache.get(program);
  if (cached !== undefined) {
    return cached;
  }
  const source = program.getSourceFiles().find(({ fileName }) => CONFIRMED_HOME.test(fileName));
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source)?.exports?.get(ts.escapeLeadingUnderscores(CONFIRMED_TYPE));
  const type = symbol === undefined ? null : checker.getDeclaredTypeOfSymbol(symbol);
  confirmedCache.set(program, type);
  return type;
}

// The press is the branded opener itself; `any` is assignable to the brand, so it proves nothing.
function pressIsConfirmed(context: OrbRuleContext, control: TSESTree.JSXOpeningElement): boolean {
  const services = context.sourceCode.parserServices;
  const press = prop(control, "onClick") ?? prop(control, "onSelect");
  const program = services?.program ?? null;
  if (press === undefined || program === null || services?.esTreeNodeToTSNodeMap === undefined) {
    return false;
  }
  const checker = program.getTypeChecker();
  const confirmed = confirmedType(program, checker);
  const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(press));
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return confirmed !== null && (type.flags & UNPROVEN) === 0 && checker.isTypeAssignableTo(type, confirmed);
}

function prop(element: TSESTree.JSXOpeningElement, name: string): TSESTree.Expression | undefined {
  const attr = element.attributes.find((item) => item.type === T.JSXAttribute && item.name.name === name);
  const value = attr?.type === T.JSXAttribute ? attr.value : undefined;
  return value?.type === T.JSXExpressionContainer && value.expression.type !== T.JSXEmptyExpression ? value.expression : undefined;
}

function previousChild(element: TSESTree.JSXElement): TSESTree.Node | undefined {
  const parent = element.parent;
  if (parent.type !== T.JSXElement && parent.type !== T.JSXFragment) {
    return undefined;
  }
  const index = parent.children.indexOf(element);
  return parent.children
    .slice(0, index)
    .findLast(
      (child) =>
        !(
          (child.type === T.JSXText && child.value.trim() === "") ||
          (child.type === T.JSXExpressionContainer && child.expression.type === T.JSXEmptyExpression)
        ),
    );
}

type Handler = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
function isHandler(node: TSESTree.Node | undefined): node is Handler {
  return node?.type === T.ArrowFunctionExpression || node?.type === T.FunctionExpression || node?.type === T.FunctionDeclaration;
}

function pressHandler(context: OrbRuleContext, control: TSESTree.JSXOpeningElement): Handler | undefined {
  const press = prop(control, "onClick") ?? prop(control, "onSelect");
  if (press?.type !== T.Identifier) {
    return isHandler(press) ? press : undefined;
  }
  const declaration = lexicalVariable(context, press)?.defs[0];
  const target = singleInitializer(context, press) ?? (declaration?.type === TSESLint.Scope.DefinitionType.FunctionName ? declaration.node : undefined);
  return isHandler(target) ? target : undefined;
}

// Staging a value is safe evidence only when computing that value does no work.
function stagedValue(value: TSESTree.Node): boolean {
  switch (value.type) {
    case T.Identifier:
    case T.Literal:
      return true;
    case T.MemberExpression:
      return !value.computed && stagedValue(value.object);
    case T.ObjectExpression:
      return value.properties.every((item) => item.type === T.Property && !item.computed && !item.method && item.kind === "init" && stagedValue(item.value));
    case T.LogicalExpression:
      return value.operator === "??" && stagedValue(value.left) && stagedValue(value.right);
    default:
      return false;
  }
}

function stateSetter(context: OrbRuleContext, state: TSESTree.Identifier): TSESLint.Scope.Variable | undefined {
  const variable = context.sourceCode.getScope(state).references.find((reference) => reference.identifier === state)?.resolved;
  const declaration = variable?.defs[0]?.node;
  if (declaration?.type !== T.VariableDeclarator || declaration.id.type !== T.ArrayPattern || declaration.init?.type !== T.CallExpression) {
    return undefined;
  }
  const hook = declaration.init.callee;
  const isState =
    hook.type === T.Identifier
      ? hook.name === "useState"
      : hook.type === T.MemberExpression && !hook.computed && hook.property.type === T.Identifier && hook.property.name === "useState";
  const [value, setter] = declaration.id.elements;
  return isState && value?.type === T.Identifier && value.name === state.name && setter?.type === T.Identifier ? lexicalVariable(context, setter) : undefined;
}

// FileTrigger's render prop opens the native picker. Only its selected-file callback can stage the confirmed write.
function fileSelection(context: OrbRuleContext, control: TSESTree.JSXOpeningElement): Handler | undefined {
  const press = prop(control, "onClick");
  if (press?.type !== T.Identifier) {
    return undefined;
  }
  const definition = lexicalVariable(context, press)?.defs[0];
  if (definition?.type !== TSESLint.Scope.DefinitionType.Parameter || !isHandler(definition.node)) {
    return undefined;
  }
  const [parameter] = definition.node.params;
  const opens =
    parameter?.type === T.ObjectPattern &&
    parameter.properties.some(
      (field) =>
        field.type === T.Property &&
        field.key.type === T.Identifier &&
        field.key.name === "open" &&
        field.value.type === T.Identifier &&
        field.value.name === press.name,
    );
  const slot = definition.node.parent;
  const picker = slot.type === T.JSXExpressionContainer ? slot.parent : undefined;
  if (!opens || picker?.type !== T.JSXElement || picker.openingElement.name.type !== T.JSXIdentifier || picker.openingElement.name.name !== "FileTrigger") {
    return undefined;
  }
  const select = prop(picker.openingElement, "onFilesSelected");
  return isHandler(select) ? select : undefined;
}

// Only a press whose entire action opens the dialog is confirmed by it. A handler that also deletes has already done the damage.
function opensDialog(context: OrbRuleContext, handler: Handler, setters: ReadonlySet<TSESLint.Scope.Variable>): boolean {
  const body = handler.body;
  const statement = body.type === T.BlockStatement && body.body.length === 1 ? body.body[0] : undefined;
  let call: TSESTree.Node | null = body;
  if (statement?.type === T.ExpressionStatement) {
    call = statement.expression;
  } else if (statement?.type === T.ReturnStatement) {
    call = statement.argument;
  }
  if (
    call?.type !== T.CallExpression ||
    call.callee.type !== T.Identifier ||
    call.arguments.length !== 1 ||
    call.arguments[0] === undefined ||
    !stagedValue(call.arguments[0])
  ) {
    return false;
  }
  const setter = lexicalVariable(context, call.callee);
  return setter !== undefined && setters.has(setter);
}

export const destructiveNeedsConfirmRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const controls: TSESTree.JSXElement[] = [];
    const covered = new Set<TSESTree.Node>();
    const keep = new Set<TSESTree.Node>();
    const undo = new Set<Handler>();
    const setters = new Set<TSESLint.Scope.Variable>();
    return {
      [CANDIDATE](control: TSESTree.JSXElement): void {
        controls.push(control);
      },
      [`${TRIGGER}, ${DRAFT}, ${DRAFT} JSXElement, ${FOOTER} JSXElement`](control: TSESTree.Node): void {
        covered.add(control);
      },
      [`${KEEP_CONTROL}, ${KEEP_CLOSE}`](control: TSESTree.JSXElement): void {
        keep.add(control);
      },
      [UNDO](action: TSESTree.ObjectExpression): void {
        const callback = context.sourceCode.getAncestors(action).findLast(isHandler);
        if (callback !== undefined) {
          undo.add(callback);
        }
      },
      [`${DIALOG} > JSXAttribute[name.name='open'] > JSXExpressionContainer Identifier`](state: TSESTree.Identifier): void {
        // An object-valued decision often checks both identity and open in the same expression.
        const setter = stateSetter(context, state);
        if (setter !== undefined) {
          setters.add(setter);
        }
      },
      "Program:exit"(): void {
        for (const control of controls) {
          const previous = previousChild(control);
          if (covered.has(control) || (previous !== undefined && keep.has(previous))) {
            continue;
          }
          const handler = pressHandler(context, control.openingElement) ?? fileSelection(context, control.openingElement);
          const proven = handler !== undefined && (undo.has(handler) || opensDialog(context, handler, setters));
          if (!(proven || pressIsConfirmed(context, control.openingElement))) {
            context.report({ node: control.openingElement, message: MESSAGE });
          }
        }
      },
    };
  },
};
