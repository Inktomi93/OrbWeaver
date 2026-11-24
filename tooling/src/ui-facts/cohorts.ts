// The composition cohorts (area C): which template, row composite, dialog anatomy, dismiss path and confirm each section uses.

import { posix } from "node:path";
import ts from "typescript";
import type { Elem, FileFacts, Rendered, Source } from "../eslint/index.ts";
import {
  attrString,
  buttonWithText,
  childrenText,
  componentsIn,
  constInitializer,
  DESTRUCTIVE_EXEMPT,
  firstLine,
  hasAny,
  insideTag,
  listSlotSurfaces,
  mounted,
  SLOT_HOPS,
  unwrap,
  visit,
} from "../eslint/index.ts";
import { editorLineOf } from "../floor/typescript/editor-lines.ts";
import type { Cell, Cohort, KeptRead, Member } from "../floor/verdict/cohort-compare.ts";
import { NOT_APPLICABLE } from "../floor/verdict/cohort-compare.ts";

const cell = (value: string, line: number): Cell => ({ value, line });
const yesNo = (flag: boolean): string => (flag ? "yes" : "no");

function member(facts: FileFacts, label: string, cells: Record<string, Cell>): Member {
  return { path: facts.source.path, section: facts.source.section, label, cells };
}

// The arrival-focus hooks of `packages/client/src/lib/use-focus-on-mount.ts`, the LIST pane's band-first one first.
const FOCUS_HOOKS = ["useFocusListArrival", "useFocusOnMount", "useFocusOnSwap"] as const;

const EMPTY_STATE = "EmptyState";
const CONFIRM_DIALOG = "ConfirmDialog";
const SAVE_BAR = "SaveBar";
const EMPTY_IN_CHILD = "EmptyState in a mounted component";
const READ_SHAPE_BOUNDARY =
  "the read's shape picks the boundary: a bounded list read whole uses LibrarySurfaceShell in a ListPage, a paginated one the collection factory (client-architecture-state-and-gates.md §14, Browse)";

/** The arrival hook the file calls, and whether it or a component it mounts renders an `EmptyState`. */
function focusAndEmpty(facts: FileFacts, byPath: ReadonlyMap<string, FileFacts>): Record<string, Cell> {
  let empty = "none";
  if (facts.tags.has(EMPTY_STATE)) {
    empty = EMPTY_STATE;
  } else if (renderedTag({ facts, elems: facts.elems }, EMPTY_STATE, byPath, 0) !== null) {
    empty = EMPTY_IN_CHILD;
  }
  const own = FOCUS_HOOKS.filter((hook) => facts.calls.has(hook)).join("+");
  let focus = own === "" ? "none" : own;
  if (own === "" && callsAny({ facts, elems: facts.elems }, FOCUS_HOOKS, byPath, 0)) {
    focus = FOCUS_IN_CHILD;
  }
  return {
    focus: cell(focus, 1),
    empty: cell(empty, firstLine(facts, EMPTY_STATE)),
  };
}

const FOCUS_IN_CHILD = "arrival hook in a mounted component";

/** Whether a component the tree mounts, up to the hop limit, calls one of the hooks. */
function callsAny(tree: Rendered, hooks: readonly string[], byPath: ReadonlyMap<string, FileFacts>, hops: number): boolean {
  return (
    hops < SLOT_HOPS &&
    mounted(tree.facts, tree.elems, byPath).some((next) => hooks.some((hook) => next.facts.calls.has(hook)) || callsAny(next, hooks, byPath, hops + 1))
  );
}

const inFeature = (facts: FileFacts): boolean => /^packages\/client\/src\/features\//u.test(facts.source.path);

// ── LIST panes ───────────────────────────────────────────────────────────────────────────────────

function rowComposite(facts: FileFacts, byPath: ReadonlyMap<string, FileFacts>): Cell {
  if (facts.tags.has("ListRow")) {
    return cell("raw ListRow", firstLine(facts, "ListRow"));
  }
  if (facts.tags.has("LibraryRow")) {
    return cell("row composite", firstLine(facts, "LibraryRow"));
  }
  for (const [name, specifier] of facts.relativeImports) {
    if (!(facts.tags.has(name) && /Row$/u.test(name))) {
      continue;
    }
    const dir = facts.source.path.slice(0, facts.source.path.lastIndexOf("/") + 1);
    const target = [`${dir}${specifier.replace(/^\.\//u, "").replace(/\.tsx?$/u, "")}.tsx`, ...resolveUp(dir, specifier)]
      .map((p) => byPath.get(p))
      .find((f) => f !== undefined);
    return cell(target?.tags.has("ListRow") === true && !target.tags.has("LibraryRow") ? "raw ListRow" : "row composite", firstLine(facts, name));
  }
  return cell(NOT_APPLICABLE, firstLine(facts, "LibraryListRows"));
}

function resolveUp(dir: string, specifier: string): readonly string[] {
  const parts = dir.split("/").filter((part) => part !== "");
  for (const step of specifier.replace(/\.tsx?$/u, "").split("/")) {
    if (step === "..") {
      parts.pop();
    } else if (step !== ".") {
      parts.push(step);
    }
  }
  return [`${parts.join("/")}.tsx`];
}

const LIBRARY_SHELL = "LibrarySurfaceShell";

/** The first element with the tag the tree renders, itself or in a component it mounts, up to the hop limit. */
function renderedTag(tree: Rendered, tag: string, byPath: ReadonlyMap<string, FileFacts>, hops: number): Elem | null {
  const own = tree.elems.find((elem) => elem.tag === tag);
  if (own !== undefined || hops >= SLOT_HOPS) {
    return own ?? null;
  }
  for (const next of mounted(tree.facts, tree.elems, byPath)) {
    const found = renderedTag(next, tag, byPath, hops + 1);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function listPane(facts: FileFacts, byPath: ReadonlyMap<string, FileFacts>): Member {
  const listPage = facts.elems.find((elem) => elem.tag === "ListPage");
  let template = "hand-built";
  if (listPage !== undefined) {
    template = "ListPage";
  } else if (hasAny(facts, "LibraryListFrame", "LibraryListLayout")) {
    template = "LibraryListFrame";
  }
  return member(facts, "surface", {
    template: cell(template, firstLine(facts, "ListPage", "LibraryListFrame", "LibraryListLayout")),
    shell: cell(facts.tags.has(LIBRARY_SHELL) ? LIBRARY_SHELL : "none", firstLine(facts, LIBRARY_SHELL)),
    rows: rowComposite(facts, byPath),
    skipTo: cell(listPage === undefined ? NOT_APPLICABLE : yesNo(listPage.attrs.has("skipTo")), listPage?.line ?? 1),
    ...focusAndEmpty(facts, byPath),
  });
}

// ── dialogs ──────────────────────────────────────────────────────────────────────────────────────

const DIALOG_TAGS = new Set([
  "FormDialog",
  "FormDialogPopup",
  "DismissDialog",
  "RequiredFormDialog",
  "ContentDialog",
  "ViewerDialog",
  "PickerDialog",
  "FlowDialog",
  "ConfirmDialog",
  "Dialog",
  "AlertDialog",
]);
const DISMISS_WORDS = new Set(["Cancel", "Close", "Done", "Back", "Dismiss", "Discard", "Keep editing"]);
const DIALOG_CLOSE = "DialogClose";
const DIALOG_EXIT =
  "each dialog composite types its own way out: Cancel, a dismiss label or corner close, a required `dismiss`, or a default Close (client-architecture-lockdown.md §3)";

/** The file declares one of the composites, so it is the composite's owner, not a member that uses it. */
function ownsAny(facts: FileFacts, names: ReadonlySet<string>): boolean {
  const sf = facts.source.sf;
  return sf !== null && componentsIn(sf).some(([name]) => names.has(name));
}

function fileDismiss(facts: FileFacts): string | null {
  if (hasAny(facts, DIALOG_CLOSE, "AlertDialogClose")) {
    return DIALOG_CLOSE;
  }
  return buttonWithText(facts, DISMISS_WORDS) ? "Button in body" : null;
}

function dismissOf(facts: FileFacts, dialog: Elem): string {
  const built = new Map([
    ["ConfirmDialog", "Cancel (built in)"],
    ["FormDialog", "Cancel (built in)"],
    ["FormDialogPopup", "Cancel (built in)"],
    ["RequiredFormDialog", "none (forced ask)"],
    ["ViewerDialog", "Close (built in)"],
    ["PickerDialog", "Close (built in)"],
  ]);
  const own = built.get(dialog.tag);
  if (own !== undefined) {
    return own;
  }
  for (const prop of ["dismissLabel", "closeButton", "dismiss"]) {
    if (dialog.attrs.has(prop)) {
      return prop;
    }
  }
  return fileDismiss(facts) ?? "none";
}

function submitLabelOf(facts: FileFacts, dialog: Elem): string {
  const sf = facts.source.sf;
  const submit = dialog.attrs.get("submit")?.getText(sf ?? undefined);
  const inline = submit === undefined ? undefined : /label:\s*["'`]([^"'`]+)["'`]/u.exec(submit)?.[1];
  if (inline !== undefined) {
    return inline;
  }
  const confirm = attrString(dialog.attrs.get("confirmLabel"));
  if (dialog.tag === "ConfirmDialog") {
    return confirm ?? "Confirm";
  }
  return submit === undefined ? "none" : "dynamic";
}

function dialogMember(facts: FileFacts, dialog: Elem): Member {
  const title = attrString(dialog.attrs.get("title"));
  return member(facts, dialog.tag, {
    composite: cell(dialog.tag, dialog.line),
    dismiss: cell(dismissOf(facts, dialog), dialog.line),
    submit: cell(submitLabelOf(facts, dialog), dialog.line),
    title: cell(title ?? "dynamic", dialog.line),
    size: cell(dialog.tag === "FormDialog" ? (attrString(dialog.attrs.get("size")) ?? "default") : NOT_APPLICABLE, dialog.line),
  });
}

// ── modal popovers ───────────────────────────────────────────────────────────────────────────────

/**
 * The cohort name the composition report lists every site of.
 *
 * @remarks An anchored popover whose body carries input takes `modal`, by the rule on `Popover` in
 * packages/ui/src/primitives/popover/popover.tsx. It is a different shape from a centred dialog, so it is counted apart.
 */
export const MODAL_POPOVER_COHORT = "modal-popover";
const POPOVER = "Popover";
const POPOVER_TRIGGER = "PopoverTrigger";
const DETACHED_TRIGGER = "detached handle";
const CONTROLLED_OPEN = "controlled open";
const NO_TRIGGER = "none";
const RUNTIME = "runtime";
const RUNTIME_RENDER = "runtime render";

/** `modal` as written: `true`, Base UI's `trap-focus`, a runtime value, or null when the popover is unfenced. */
function modalOf(popover: Elem): string | null {
  const attr = popover.attrs.get("modal");
  if (attr === undefined) {
    return null;
  }
  const literal = attrString(attr);
  if (literal !== undefined) {
    return literal;
  }
  const expression =
    attr.initializer === undefined
      ? "true"
      : attr.initializer
          .getText()
          .replace(/^\{|\}$/gu, "")
          .trim();
  if (expression === "false") {
    return null;
  }
  return expression === "true" ? "true" : RUNTIME;
}

/** The JSX element nearest above `elem` with the tag, or null. */
function nearestTag(elem: Elem, tag: string): ts.JsxElement | null {
  for (let node: ts.Node = elem.element.parent; !ts.isSourceFile(node); node = node.parent) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === tag) {
      return node;
    }
  }
  return null;
}

const jsxTagOf = (element: ts.JsxElement | ts.JsxSelfClosingElement): string => (ts.isJsxElement(element) ? element.openingElement : element).tagName.getText();

/** The element a trigger renders: its own button with no `render`, the tag a literal `render` names, or a runtime render. */
function renderedTrigger(trigger: Elem): string {
  const render = trigger.attrs.get("render");
  if (render === undefined) {
    return POPOVER_TRIGGER;
  }
  const shown = render.initializer !== undefined && ts.isJsxExpression(render.initializer) ? render.initializer.expression : undefined;
  return shown !== undefined && (ts.isJsxElement(shown) || ts.isJsxSelfClosingElement(shown)) ? jsxTagOf(shown) : RUNTIME_RENDER;
}

/** What opens the popover: the element its own trigger renders, a trigger elsewhere through a handle, or its `open` prop alone. */
function triggerOf(facts: FileFacts, popover: Elem): Cell {
  const trigger = facts.elems.find((elem) => elem.tag === POPOVER_TRIGGER && nearestTag(elem, POPOVER) === popover.element);
  if (trigger !== undefined) {
    return cell(renderedTrigger(trigger), trigger.line);
  }
  if (popover.attrs.has("handle")) {
    return cell(DETACHED_TRIGGER, popover.line);
  }
  return cell(popover.attrs.has("open") ? CONTROLLED_OPEN : NO_TRIGGER, popover.line);
}

function modalPopoverMembers(facts: FileFacts): readonly Member[] {
  return facts.elems.flatMap((elem) => {
    const modal = elem.tag === POPOVER && elem.kind !== "raw" ? modalOf(elem) : null;
    return modal === null ? [] : [member(facts, POPOVER, { modal: cell(modal, elem.line), trigger: triggerOf(facts, elem) })];
  });
}

// ── notices and muted lines ──────────────────────────────────────────────────────────────────────

const NOTICE = "Notice";
const MUTED_LINE = "MutedLine";
const HAND_BUILT = "hand-built";
// A Card in a colour tone with the soft or outline fill is a status box (UI-Density-Law §4.3, the Card `variant` row).
const STATUS_FILLS = new Set(["soft", "outline"]);
const NOTICE_SITES = "packages/client/src/components/notice.tsx";
const MUTED_LINE_SITES = "packages/client/src/components/muted-line.tsx";
// The condition of an arm that draws the empty branch of a list.
const EMPTY_CONDITION = /\.length\s*===?\s*0|\bisEmpty\b/u;

const kept = (path: string, label: string, count: number, reason: string): KeptRead => ({ path, label, value: HAND_BUILT, count, reason });
const CHOICE_ISLAND = "a choice island: the options a turn offers as a set of buttons, not one condition and its recovery";
const NOTICE_KEPT: readonly KeptRead[] = [
  kept(
    "packages/client/src/features/chat/components/composer-drop-target.tsx",
    "Card",
    1,
    "a drop affordance, not a status box (docs/plans/cross-surface-consistency/design.md, Empty states)",
  ),
  kept("packages/client/src/features/chat/components/message-choices-block.tsx", "Card", 1, CHOICE_ISLAND),
  kept("packages/client/src/features/rpg/components/rpg-choice-echo.tsx", "Card", 1, CHOICE_ISLAND),
  kept(
    "packages/client/src/features/refinery/components/payload-view.tsx",
    "Card",
    1,
    "the verdict banner: a run's verdict heading, its prose and its gauge, tinted by the schema author's tone map",
  ),
  kept(
    "packages/client/src/features/rpg/components/rpg-veiled-section.tsx",
    "Card",
    2,
    "a veiled ledger row: a host-only record with its turn and a reveal gate, one row per lie or hidden line",
  ),
];
const VALIDATION_HINT = "a hint that says why the form cannot be saved yet, not the empty line of a list";
const MUTED_LINE_KEPT: readonly KeptRead[] = [
  kept("packages/client/src/features/automation/components/rule-editor-actions.tsx", "Text", 1, VALIDATION_HINT),
  kept("packages/client/src/features/automation/components/rule-list-action-fields.tsx", "Text", 1, VALIDATION_HINT),
  // One ruling for both reads: a second ruling at the same path would cover the same first read again.
  kept(
    "packages/client/src/features/roster-preset/components/roster-picker.tsx",
    "Text",
    2,
    "one state of the rules include line, the save control's description, whose states are one element with one id; and the hint that a roster needs a name to save",
  ),
  kept("packages/client/src/features/discovery/components/corpus-compare-tab.tsx", "Text", 1, "the no-value mark in a compared value cell"),
  kept("packages/client/src/features/discovery/surfaces/corpus-moment-surface.tsx", "Text", 1, "the scene hit's own snippet, shown when no window loaded"),
  kept(
    "packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx",
    "Text",
    1,
    "the body of a preview block button, part of the button's name",
  ),
  kept("packages/client/src/features/regex/components/regex-context-body.tsx", "Text", 1, "a destructive warning that the script runs nowhere"),
];

/** A toned Card with a status fill, written in a feature: a notice the feature drew by hand. */
function handBuiltNotice(elem: Elem): boolean {
  const fill = elem.attrs.get("variant");
  const literal = attrString(fill);
  return elem.tag === "Card" && elem.attrs.has("tone") && fill !== undefined && (literal === undefined || STATUS_FILLS.has(literal));
}

function noticeMembers(facts: FileFacts): readonly Member[] {
  if (facts.source.path === NOTICE_SITES) {
    return [];
  }
  return facts.elems.flatMap((elem) => {
    if (elem.tag === NOTICE) {
      return [member(facts, NOTICE, { composite: cell(NOTICE, elem.line), tone: cell(attrString(elem.attrs.get("tone")) ?? RUNTIME, elem.line) })];
    }
    return inFeature(facts) && handBuiltNotice(elem)
      ? [member(facts, "Card", { composite: cell(HAND_BUILT, elem.line), tone: cell(attrString(elem.attrs.get("tone")) ?? RUNTIME, elem.line) })]
      : [];
  });
}

/** The condition that gates the arm the element is drawn in: a ternary's true branch, an `&&` right side, or an `if` that returns it. */
function armCondition(elem: Elem): ts.Expression | null {
  let node: ts.Node = elem.element;
  while (ts.isParenthesizedExpression(node.parent)) {
    node = node.parent;
  }
  const parent = node.parent;
  if (ts.isConditionalExpression(parent) && parent.whenTrue === node) {
    return parent.condition;
  }
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.right === node) {
    return parent.left;
  }
  if (ts.isReturnStatement(parent)) {
    const block = ts.isBlock(parent.parent) ? parent.parent.parent : parent.parent;
    return ts.isIfStatement(block) ? block.expression : null;
  }
  return null;
}

function mutedLineMembers(facts: FileFacts): readonly Member[] {
  if (facts.source.path === MUTED_LINE_SITES) {
    return [];
  }
  const sf = facts.source.sf;
  return facts.elems.flatMap((elem) => {
    if (elem.tag === MUTED_LINE) {
      return [
        member(facts, MUTED_LINE, {
          line: cell(MUTED_LINE, elem.line),
          action: cell(yesNo(elem.attrs.has("action")), elem.line),
          announce: cell(yesNo(elem.attrs.has("announce")), elem.line),
        }),
      ];
    }
    const condition = elem.tag === "Text" && inFeature(facts) ? armCondition(elem) : null;
    return condition !== null && sf !== null && EMPTY_CONDITION.test(condition.getText(sf))
      ? [member(facts, "Text", { line: cell(HAND_BUILT, elem.line), action: cell(NOT_APPLICABLE, elem.line), announce: cell(NOT_APPLICABLE, elem.line) })]
      : [];
  });
}

// ── destructive actions ──────────────────────────────────────────────────────────────────────────

const DESTRUCTIVE_WORD = /^(?:Restore|Delete|Remove|Reset|Discard|Clear|Revert|Drop|Wipe|Erase|Overwrite|Replace)\b/iu;
const NOT_A_VERB_ON_DATA = /\b(?:search|filters?)\b/iu;
const CONFIRMS = new Set(["ConfirmDialog", "DestructiveAction", "AlertDialog"]);
const ACTION_TAGS = new Set(["Button", "GlyphButton", "InlineAction", "MenuItem"]);
// The same evidence `orb/destructive-needs-confirm` reads: an Undo, a Keep or Cancel step beside the control, a Cancel-able dialog,
// and the files the owner exempted (`DESTRUCTIVE_EXEMPT`).
const INLINE_CONFIRM_WORDS = new Set(["Keep", "Cancel"]);
const EXEMPT_PATHS = new Set(Object.keys(DESTRUCTIVE_EXEMPT));

function destructiveMembers(facts: FileFacts): readonly Member[] {
  const sf = facts.source.sf;
  if (sf === null) {
    return [];
  }
  const out: Member[] = [];
  for (const elem of facts.elems) {
    const text = childrenText(elem.element) ?? "";
    const marked = attrString(elem.attrs.get("tone")) === "destructive";
    const destructive = ACTION_TAGS.has(elem.tag) && ((DESTRUCTIVE_WORD.test(text) && !NOT_A_VERB_ON_DATA.test(text)) || marked);
    if (!destructive) {
      continue;
    }
    const guarded =
      insideTag(elem, CONFIRMS) ||
      hasAny(
        facts,
        "ConfirmDialog",
        "DestructiveAction",
        "AlertDialog",
        "RowActionsMenu",
        "ModelRunConfirmDialog",
        "FormDialog",
        "FormDialogPopup",
        "DismissDialog",
        "ContentDialog",
        "FlowDialog",
      ) ||
      sf.text.includes('label: "Undo"') ||
      buttonWithText(facts, INLINE_CONFIRM_WORDS) ||
      EXEMPT_PATHS.has(facts.source.path);
    out.push(member(facts, text === "" ? elem.tag : text, { confirm: cell(guarded ? "confirm in file" : "none", elem.line) }));
  }
  return out;
}

// ── detail headers, context tabs, editors, row menus ────────────────────────────────────────────

const HEADER_TEMPLATES = new Set(["DetailHeader", "MemberDrillHeader"]);
const HEADER_SPLIT =
  "one family in two templates: `DetailHeader` is a subject's identity row and `MemberDrillHeader` the drilled collection member's, with its Back on the row (packages/client/src/components/detail-header.tsx and member-drill-header.tsx headers)";

/** `deferToShell` as written: its default, a literal, or a value the caller computes. */
function deferOf(elem: Elem): string {
  const attr = elem.attrs.get("deferToShell");
  if (attr === undefined) {
    return "default";
  }
  const value = attr.initializer;
  const literal =
    value === undefined
      ? "true"
      : value
          .getText()
          .replace(/^\{|\}$/gu, "")
          .trim();
  return literal === "true" || literal === "false" ? literal : "runtime";
}

function headerMembers(facts: FileFacts): readonly Member[] {
  // A template's own file draws the row it owns, so it is the owner, not a member.
  if (ownsAny(facts, HEADER_TEMPLATES)) {
    return [];
  }
  const out: Member[] = [];
  for (const elem of facts.elems) {
    const isTemplate = HEADER_TEMPLATES.has(elem.tag);
    if (!(isTemplate || elem.attrs.has("data-shell-identity"))) {
      continue;
    }
    const detail = elem.tag === "DetailHeader";
    out.push(
      member(facts, elem.tag, {
        header: cell(isTemplate ? elem.tag : "hand-built data-shell-identity", elem.line),
        deferToShell: cell(detail ? deferOf(elem) : NOT_APPLICABLE, elem.line),
        step: cell(detail ? (attrString(elem.attrs.get("step")) ?? "title") : NOT_APPLICABLE, elem.line),
      }),
    );
  }
  return out;
}

const MUTATION_FACTORIES = new Set(["createEntityMutation", "useMutation"]);

/** The columns a CONTEXT body's own component answers: its tabs, where its mutations live, its confirm, its arrival hook and its empty state. */
function contextTabCells(facts: FileFacts, byPath: ReadonlyMap<string, FileFacts>): Record<string, Cell> {
  const tabs = [...facts.tags].filter((tag) => /^Tabs?[A-Z]?/u.test(tag) && facts.elems.some((elem) => elem.tag === tag && elem.kind === "ui")).sort();
  const mutations = [...facts.calls].filter((call) => MUTATION_FACTORIES.has(call));
  return {
    tabs: cell(tabs.length === 0 ? "none" : tabs.join("+"), firstLine(facts, ...tabs)),
    inlineMutations: cell(mutations.length === 0 ? "none" : "defined in the component file", 1),
    confirm: cell(
      hasAny(facts, "ConfirmDialog", "DestructiveAction", "AlertDialog") ? CONFIRM_DIALOG : "none",
      firstLine(facts, "ConfirmDialog", "DestructiveAction"),
    ),
    ...focusAndEmpty(facts, byPath),
  };
}

// ── CONTEXT tab bodies ───────────────────────────────────────────────────────────────────────────

const CONTEXT_TAB_BODY = "ContextTabBody";
const CONTEXT_MINT = "defineContextTabs";
const TAB_DEF_TYPE = /\bContextTabDef\b/u;
// A section's `single` context and a collection's `body` context each register one body, under `body` and `render`.
const BODY_CONTEXTS: ReadonlyMap<string, string> = new Map([
  ["single", "body"],
  ["body", "render"],
]);
const HAND_BUILT_ROOT = "hand-built";

/** One body a CONTEXT registration declares: the expression that draws it and the name the census lists it by. */
interface ContextBody {
  readonly label: string;
  readonly line: number;
  readonly draw: ts.Expression;
}

function propertyOf(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === name) {
      return property.initializer;
    }
  }
  return undefined;
}

// The type a declaration or a function's return is annotated with, when it carries one.
const declaredType = (node: ts.Node): ts.TypeNode | undefined =>
  ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) ? node.type : undefined;

/** The object is a tab: it sits in the mint's call or under a declaration typed as a tab definition. */
function isTabDefinition(object: ts.ObjectLiteralExpression): boolean {
  for (let node: ts.Node = object.parent; !ts.isSourceFile(node); node = node.parent) {
    if (ts.isCallExpression(node) && node.expression.getText() === CONTEXT_MINT) {
      return true;
    }
    const type = declaredType(node);
    if (type !== undefined && TAB_DEF_TYPE.test(type.getText())) {
      return true;
    }
  }
  return false;
}

/** The files of the checkout by repo path, `.ts` and `.tsx`, for reading a constant another module declares. */
type SourcesByPath = ReadonlyMap<string, ts.SourceFile>;

// A string a `const` holds, here or in the module a relative import names; the label falls back to the expression's text.
function idText(sf: ts.SourceFile, path: string, expression: ts.Expression, sources: SourcesByPath): string {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (!ts.isIdentifier(node)) {
    return node.getText(sf);
  }
  const local = constInitializer(sf, node.text);
  if (local !== null && ts.isStringLiteralLike(local)) {
    return local.text;
  }
  const specifier = sf.statements.find(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith(".") &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some((element) => element.name.text === node.text),
  );
  const target =
    specifier === undefined ? undefined : sources.get(posix.normalize(posix.join(posix.dirname(path), (specifier.moduleSpecifier as ts.StringLiteral).text)));
  const imported = target === undefined ? null : constInitializer(target, node.text);
  return imported !== null && ts.isStringLiteralLike(imported) ? imported.text : node.text;
}

/** Every body a file registers: a tab's `body`, a `single` context's `body` and a collection's `body` context's `render`. */
function contextBodiesIn(facts: FileFacts, sources: SourcesByPath): readonly ContextBody[] {
  const sf = facts.source.sf;
  if (sf === null) {
    return [];
  }
  const found: ContextBody[] = [];
  const line = (node: ts.Node): number => editorLineOf(sf, node.getStart(sf));
  visit(sf, (node) => {
    if (!ts.isObjectLiteralExpression(node)) {
      return;
    }
    const body = propertyOf(node, "body");
    const id = propertyOf(node, "id");
    if (body !== undefined && id !== undefined && isTabDefinition(node)) {
      found.push({ label: idText(sf, facts.source.path, id, sources), line: line(node), draw: body });
      return;
    }
    const kindValue = propertyOf(node, "kind");
    const kind = kindValue !== undefined && ts.isStringLiteralLike(kindValue) ? kindValue.text : undefined;
    const slot = kind === undefined ? undefined : BODY_CONTEXTS.get(kind);
    const draw = slot === undefined ? undefined : propertyOf(node, slot);
    if (kind !== undefined && draw !== undefined && ts.isPropertyAssignment(node.parent) && node.parent.name.getText() === "context") {
      found.push({ label: `${kind} context`, line: line(node), draw });
    }
  });
  return found;
}

// What an expression renders on each of its branches: both arms of `?:`, what `&&` renders when it renders, either side of `||` and `??`.
// `null`, `undefined` and `false` render nothing, so they draw no root.
function renderedBy(expression: ts.Expression): readonly ts.Expression[] {
  const node = unwrap(expression);
  if (ts.isConditionalExpression(node)) {
    return [...renderedBy(node.whenTrue), ...renderedBy(node.whenFalse)];
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      return renderedBy(node.right);
    }
    if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      return [...renderedBy(node.left), ...renderedBy(node.right)];
    }
  }
  const nothing = node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.FalseKeyword || (ts.isIdentifier(node) && node.text === "undefined");
  return nothing ? [] : [node];
}

// A component wrapped in `memo(Fn)` or `forwardRef(fn)` renders what its function does.
const COMPONENT_WRAPPERS: ReadonlySet<string> = new Set(["memo", "forwardRef"]);
// The registration slots that draw a body; a call through one renders a body the census lists as its own member.
const DRAW_SLOTS: ReadonlySet<string> = new Set(["body", ...BODY_CONTEXTS.values()]);
// `Surface` declares a tier on a `display: contents` box, so it draws no box of its own and its children are the roots.
const BOXLESS_TAGS: ReadonlySet<string> = new Set(["Surface"]);
// How many component and factory steps the root walk follows from a registration before it reads a root as unread.
const ROOT_HOPS = 6;
// What a branch can root in besides an owner kind: a dialog, which portals out of the pane, and a body another registration draws.
const DIALOG_ROOT = "dialog";
const DELEGATED_ROOT = "member body";

/** The roots a component or a draw returns: an arrow's expression body, or each `return` of its own body (a nested function's are its own). */
function branchesOf(node: ts.Node): readonly ts.Expression[] {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && COMPONENT_WRAPPERS.has(node.expression.text)) {
    const [inner] = node.arguments;
    return inner === undefined ? [] : branchesOf(inner);
  }
  if (!(ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))) {
    return ts.isExpression(node) ? renderedBy(node) : [];
  }
  const body = node.body;
  if (body === undefined) {
    return [];
  }
  if (!ts.isBlock(body)) {
    return renderedBy(body);
  }
  const returned: ts.Expression[] = [];
  const walk = (inner: ts.Node): void => {
    if (ts.isFunctionLike(inner)) {
      return;
    }
    if (ts.isReturnStatement(inner) && inner.expression !== undefined) {
      returned.push(...renderedBy(inner.expression));
    }
    ts.forEachChild(inner, walk);
  };
  ts.forEachChild(body, walk);
  return returned;
}

// A declaration in the file by name, at any depth, component or factory: the function, or the initializer a `const` holds.
function declarationIn(sf: ts.SourceFile, name: string): ts.Node | undefined {
  let found: ts.Node | undefined;
  visit(sf, (node) => {
    if (found !== undefined) {
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node;
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer !== undefined) {
      found = unwrap(node.initializer);
    }
  });
  return found;
}

/** The root each branch of a draw stands on: an owner kind, a dialog, a body another registration draws, or {@link HAND_BUILT_ROOT}. */
function rootKinds(facts: FileFacts, draw: ts.Node, byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  const branches = branchesOf(draw);
  if (branches.length === 0 || hops > ROOT_HOPS) {
    return [HAND_BUILT_ROOT];
  }
  return branches.flatMap((branch) => branchKind(facts, branch, byPath, hops));
}

function branchKind(facts: FileFacts, root: ts.Expression, byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  if (ts.isArrowFunction(root) || ts.isFunctionExpression(root)) {
    // A curried factory, as the rpg tabs' `gameTab(label, render)` is, hands back the draw itself.
    return rootKinds(facts, root, byPath, hops + 1);
  }
  if (ts.isCallExpression(root)) {
    return callKinds(facts, root, byPath, hops);
  }
  if (ts.isJsxFragment(root)) {
    return childKinds(facts, root.children, byPath, hops);
  }
  const elem = facts.elems.find((candidate) => candidate.element === root);
  if (elem === undefined) {
    return [HAND_BUILT_ROOT];
  }
  return elemKinds(facts, elem, byPath, hops);
}

// A call at a branch's root: a factory declared in the file roots where its returns do, and a registration's own draw slot is delegated.
function callKinds(facts: FileFacts, call: ts.CallExpression, byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  if (ts.isPropertyAccessExpression(call.expression) && DRAW_SLOTS.has(call.expression.name.text)) {
    return [DELEGATED_ROOT];
  }
  if (ts.isCallExpression(call.expression)) {
    // `gameTab(label, render)(state)` calls the draw a curried factory hands back.
    return callKinds(facts, call.expression, byPath, hops + 1);
  }
  const sf = facts.source.sf;
  const factory = sf !== null && ts.isIdentifier(call.expression) ? declarationIn(sf, call.expression.text) : undefined;
  return factory === undefined ? [HAND_BUILT_ROOT] : rootKinds(facts, factory, byPath, hops + 1);
}

function elemKinds(facts: FileFacts, elem: Elem, byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  if (elem.tag === CONTEXT_TAB_BODY) {
    return [attrString(elem.attrs.get("kind")) ?? "sections"];
  }
  if (DIALOG_TAGS.has(elem.tag)) {
    return [DIALOG_ROOT];
  }
  if (elem.kind === "ui" && BOXLESS_TAGS.has(elem.tag) && ts.isJsxElement(elem.element)) {
    return childKinds(facts, elem.element.children, byPath, hops);
  }
  return componentKinds(facts, elem, byPath, hops + 1);
}

// The roots of a box-less parent's children: a dialog beside the body portals out of the pane, so it is no root; nothing else is the body.
function childKinds(facts: FileFacts, children: ts.NodeArray<ts.JsxChild>, byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  const kinds = children.flatMap((child): readonly string[] => {
    if (ts.isJsxText(child)) {
      return child.containsOnlyTriviaWhiteSpaces ? [] : [HAND_BUILT_ROOT];
    }
    if (ts.isJsxExpression(child)) {
      return child.expression === undefined ? [] : renderedBy(child.expression).flatMap((branch) => branchKind(facts, branch, byPath, hops));
    }
    return ts.isJsxFragment(child) ? childKinds(facts, child.children, byPath, hops) : branchKind(facts, child, byPath, hops);
  });
  const drawn = kinds.filter((kind) => kind !== DIALOG_ROOT);
  return drawn.length === 0 ? [HAND_BUILT_ROOT] : drawn;
}

// A component at a branch's root roots where its own returns do: a same-file one, or one a relative import or `#components` mounts.
function componentKinds(facts: FileFacts, elem: Elem, byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  const local = elem.imported === null && facts.source.sf !== null ? declarationIn(facts.source.sf, elem.tag) : undefined;
  if (local !== undefined) {
    return rootKinds(facts, local, byPath, hops);
  }
  const [next] = mounted(facts, [elem], byPath);
  const sf = next?.facts.source.sf ?? null;
  const declared = sf === null ? undefined : declarationIn(sf, elem.imported?.name ?? elem.tag);
  return next === undefined || declared === undefined ? [HAND_BUILT_ROOT] : rootKinds(next.facts, declared, byPath, hops);
}

/** The elements a body draws: its own, and those of a same-file factory it calls, as the rpg tabs' shared wrapper is. */
function bodyElems(facts: FileFacts, draw: ts.Expression): readonly Elem[] {
  const sf = facts.source.sf;
  const within = (node: ts.Node): readonly Elem[] => facts.elems.filter((elem) => elem.opening.pos >= node.pos && elem.opening.end <= node.end);
  const factories = new Set<string>();
  visit(draw, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      factories.add(node.expression.text);
    }
  });
  const declared: ts.Node[] = [];
  if (sf !== null && factories.size > 0) {
    visit(sf, (node) => {
      if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name !== undefined && factories.has(node.name.getText())) {
        declared.push(node);
      }
    });
  }
  return [...within(draw), ...declared.flatMap(within)];
}

function contextBodyMember(facts: FileFacts, body: ContextBody, byPath: ReadonlyMap<string, FileFacts>): Member {
  // The owner stands at the root of every branch the body returns, through the components it mounts there; one branch without it is hand-built.
  const kinds = new Set(rootKinds(facts, body.draw, byPath, 0));
  // A branch that is only a dialog draws no body in the pane.
  const root = kinds.has(HAND_BUILT_ROOT) || kinds.has(DIALOG_ROOT) ? HAND_BUILT_ROOT : `${CONTEXT_TAB_BODY} ${[...kinds].sort().join("+")}`;
  // The columns the body's own component answers are read on the first component the registration mounts.
  const drawn = mounted(facts, bodyElems(facts, body.draw), byPath)[0]?.facts ?? facts;
  return member(facts, body.label, {
    root: cell(root, body.line),
    ...contextTabCells(drawn, byPath),
  });
}

const EDITOR_TEMPLATE: ReadonlySet<string> = new Set(["EditorPage"]);

// The editor column's signature, as `orb/page-template-shapes` reads it.
const handSpelledColumn = (facts: FileFacts): boolean => facts.source.text.includes("mx-auto") && facts.source.text.includes("max-inline-(--width-content-col");

function editor(facts: FileFacts, byPath: ReadonlyMap<string, FileFacts>): Member {
  // The template is the surface's whether it renders the page itself or through the body it mounts.
  const page = renderedTag({ facts, elems: facts.elems }, "EditorPage", byPath, 0);
  let template = "none";
  if (page !== null) {
    template = `EditorPage kind=${attrString(page.attrs.get("kind")) ?? "form"}`;
  } else if (handSpelledColumn(facts)) {
    template = "hand-spelled column";
  }
  let submit = "none";
  if (hasAny(facts, SAVE_BAR)) {
    submit = SAVE_BAR;
  } else if (hasAny(facts, "FormDialog", "FormDialogPopup")) {
    submit = "FormDialog";
  }
  const states = focusAndEmpty(facts, byPath);
  // Arrival focus is the surface's: a part of an editor page that its surface mounts has none of its own (use-focus-on-mount.ts).
  const surface = facts.source.path.includes("/surfaces/");
  return member(facts, "file", {
    template: cell(template, page?.line ?? 1),
    save: cell(submit, firstLine(facts, SAVE_BAR, "FormDialog", "FormDialogPopup")),
    ...states,
    focus: surface ? (states["focus"] ?? cell(NOT_APPLICABLE, 1)) : cell(NOT_APPLICABLE, 1),
  });
}

function rowMenu(facts: FileFacts, elem: Elem): Member {
  return member(facts, "RowActionsMenu", {
    destructive: cell(yesNo(elem.attrs.has("destructive")), elem.line),
    attrs: cell([...elem.attrs.keys()].sort().join(","), elem.line),
  });
}

/** Every composition cohort over the client's TSX files; `sources` holds every scanned file, so a constant another module declares is read. */
export function buildCohorts(all: readonly FileFacts[], sources: readonly Source[]): readonly Cohort[] {
  const client = all.filter((facts) => facts.source.layer === "client");
  const byPath = new Map(client.map((facts) => [facts.source.path, facts]));
  const sourcesByPath: SourcesByPath = new Map(sources.flatMap((source) => (source.sf === null ? [] : [[source.path, source.sf] as const])));
  const feature = client.filter(inFeature);
  const slotted = listSlotSurfaces(all);
  const lists = feature.filter((facts) => slotted.has(facts.source.path));
  // Editor pages: the template's users, a hand-spelled column, and the CONTENT surfaces that edit one subject. A field
  // editor component named for what it edits is no page.
  const editors = client.filter(
    (facts) =>
      !ownsAny(facts, EDITOR_TEMPLATE) &&
      (facts.tags.has("EditorPage") || handSpelledColumn(facts) || /\/surfaces\/[a-z-]*(?:editor|member)[a-z-]*-surface\.tsx$/u.test(facts.source.path)),
  );
  return [
    {
      name: "list-pane",
      what: "LIST surfaces: template, shell, row composite, skipTo, focus hook, empty state",
      columns: ["template", "shell", "rows", "skipTo", "focus", "empty"],
      // Every surface ships a designed empty state (client-architecture-state-and-gates.md §11, the three-states law).
      defects: { rows: ["raw ListRow"], empty: ["none"] },
      kept: {
        shell: { [LIBRARY_SHELL]: READ_SHAPE_BOUNDARY, none: READ_SHAPE_BOUNDARY },
        empty: { [EMPTY_IN_CHILD]: "the empty state is designed in the component the surface mounts (client-architecture-state-and-gates.md §11)" },
      },
      keptSites: {
        empty: {
          "packages/client/src/features/config/surfaces/config-list-surface.tsx": {
            value: "none",
            reason:
              "the Settings map renders every config group, a total registry (client-architecture-state-and-gates.md §12, row 3), so the list is never empty and has no empty arm",
          },
        },
        focus: {
          "packages/client/src/features/config/surfaces/config-list-surface.tsx": {
            value: "useFocusOnMount",
            reason:
              "the Settings band carries no primary action, so the shared list arrival would fall back to a root with no visible focus; arrival lands on the active group's band, a control with the house ring (UI-Architecture-and-Layout.md §4.3, rule 6)",
          },
          "packages/client/src/features/discovery/surfaces/corpus-list-surface.tsx": {
            value: "useFocusOnMount",
            reason: "arrival lands on the omnibox, because the Corpus LIST is the search omnibox (UI-Architecture-and-Layout.md §4.1)",
          },
          "packages/client/src/features/tag/surfaces/labels-list-surface.tsx": {
            value: "useFocusOnMount",
            reason: "the Labels finder owns phone arrival, because Labels lands on its LIST on phones (D271); the visible library owns desktop arrival",
          },
        },
      },
      members: lists.map((facts) => listPane(facts, byPath)),
    },
    {
      name: "detail-header",
      what: "detail headers: component, deferToShell, step",
      columns: ["header", "deferToShell", "step"],
      kept: {
        header: Object.fromEntries([...HEADER_TEMPLATES].map((tag) => [tag, HEADER_SPLIT])),
        deferToShell: {
          runtime:
            "an unnamed session defers its card identity to the shell's narrow title (packages/client/src/features/refinery/components/session-masthead.tsx header)",
        },
        step: {
          masthead: "`masthead` is a workbench's one opening statement, at the display step (packages/client/src/components/detail-header.tsx `NAME_VOICE`)",
        },
      },
      members: client.flatMap(headerMembers),
    },
    {
      name: "dialog",
      what: "dialogs: composite, dismiss path, submit label, title, size",
      columns: ["dismiss", "size"],
      info: ["composite", "submit"],
      defects: { dismiss: ["none"] },
      // Each composite types its own way out (client-architecture-lockdown.md §3, "Composites are typed to be used right").
      kept: {
        dismiss: {
          "Close (built in)": DIALOG_EXIT,
          dismissLabel: DIALOG_EXIT,
          closeButton: DIALOG_EXIT,
          dismiss: DIALOG_EXIT,
          "none (forced ask)": "`RequiredFormDialog` is the one forced ask, held to the first-run file (D330; client-architecture-lockdown.md §3)",
          [DIALOG_CLOSE]:
            "a components-tier composite closes a raw dialog with its own close part; the raw-dialog ban binds features (client-architecture-lockdown.md §3)",
        },
        size: Object.fromEntries(
          ["sm", "lg"].map((width) => [
            width,
            "a dialog's width is a variant chosen for its content (UI-Primitives-and-Reuse.md §13.9, the Dialog width variants)",
          ]),
        ),
      },
      members: client.flatMap((facts) =>
        ownsAny(facts, DIALOG_TAGS)
          ? []
          : facts.elems.filter((elem) => DIALOG_TAGS.has(elem.tag) && elem.kind !== "raw").map((elem) => dialogMember(facts, elem)),
      ),
    },
    {
      name: MODAL_POPOVER_COHORT,
      what: "modal popovers: an anchored popover fenced with `modal` because its body carries input, and what opens it",
      // A census, not a convention: every site is listed in the composition report with its trigger.
      columns: [],
      info: ["modal", "trigger"],
      members: client.flatMap(modalPopoverMembers),
    },
    {
      name: "notice",
      what: "status boxes: the Notice composite, and every toned soft or outline Card a feature draws",
      columns: ["composite"],
      info: ["tone"],
      // One notice composite owns a status box (packages/client/src/components/notice.tsx header).
      defects: { composite: [HAND_BUILT] },
      keptReads: { composite: NOTICE_KEPT },
      members: client.flatMap(noticeMembers),
    },
    {
      name: "muted-line",
      what: "the muted line of a list inside a surface: the MutedLine owner, and every Text a feature draws in an empty arm",
      columns: ["line"],
      info: ["action", "announce"],
      // One owner draws the muted line (packages/client/src/components/muted-line.tsx header).
      defects: { line: [HAND_BUILT] },
      keptReads: { line: MUTED_LINE_KEPT },
      members: client.flatMap(mutedLineMembers),
    },
    {
      name: "context-tab",
      what: "every body a CONTEXT registration declares: its root, Tabs shape, mutation home, confirm, focus hook, empty state",
      columns: ["root", "tabs", "inlineMutations", "confirm", "focus", "empty"],
      // Every registered body draws the one CONTEXT column at its root (UI-Density-Law.md §3.1).
      defects: { root: [HAND_BUILT_ROOT], inlineMutations: ["defined in the component file"] },
      kept: {
        confirm: {
          [CONFIRM_DIALOG]:
            "a tab that holds a destructive verb confirms it through DestructiveAction or a controlled ConfirmDialog (client-architecture-state-and-gates.md §14, Destructive confirms)",
        },
        empty: { [EMPTY_IN_CHILD]: "the empty state is designed in the component the tab body mounts (client-architecture-state-and-gates.md §11)" },
      },
      members: client.flatMap((facts) => contextBodiesIn(facts, sourcesByPath).map((body) => contextBodyMember(facts, body, byPath))),
    },
    {
      name: "editor",
      what: "editors: page template, save path, focus hook, empty state",
      columns: ["template", "save", "focus"],
      // An editor edits one subject, so its empty arm is the subject gone; whether it draws one is a spread.
      info: ["empty"],
      defects: { template: ["hand-spelled column"] },
      kept: {
        template: {
          "EditorPage kind=instrument":
            "a control-track instrument holds the narrow cap through its `instrument` kind (packages/client/src/components/editor-page.tsx)",
        },
        save: {
          [SAVE_BAR]:
            "entity editors autosave (UI-Primitives-and-Reuse.md §13.4), and the character editor's sticky identity bar carries that status with no Save or Discard (character-editor-surface.tsx header)",
        },
        focus: { [FOCUS_IN_CHILD]: "the editor body the surface mounts takes arrival focus (tag-member-surface.tsx focus ruling)" },
      },
      members: editors.map((facts) => editor(facts, byPath)),
    },
    {
      name: "row-menu",
      what: "row action menus: destructive arm, prop signature",
      // A menu carries the verbs its row has; whether one destroys, and which typed options it sets, is the row's, so
      // both are a spread to read. The confirm a destructive arm needs is the destructive-action cohort's column.
      columns: [],
      info: ["destructive", "attrs"],
      members: client.flatMap((facts) => facts.elems.filter((elem) => elem.tag === "RowActionsMenu").map((elem) => rowMenu(facts, elem))),
    },
    {
      name: "destructive-action",
      what: "destructive verbs (Restore, Delete, Remove, Reset, Discard, Clear...): a confirm beside them",
      columns: ["confirm"],
      defects: { confirm: ["none"] },
      members: client.flatMap(destructiveMembers),
    },
  ];
}
