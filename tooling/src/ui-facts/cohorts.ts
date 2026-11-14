// The composition cohorts (area C): which template, row composite, dialog anatomy, dismiss path and confirm each section uses.

import ts from "typescript";
import type { Elem, FileFacts, Rendered } from "../eslint/index.ts";
import {
  attrString,
  buttonWithText,
  childrenText,
  componentsIn,
  DESTRUCTIVE_EXEMPT,
  firstLine,
  hasAny,
  insideTag,
  listSlotSurfaces,
  mounted,
  SLOT_HOPS,
  visit,
} from "../eslint/index.ts";
import type { Cell, Cohort, Member } from "../floor/verdict/cohort-compare.ts";
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

const literalOf = (expression: ts.Expression | undefined): string | undefined =>
  expression !== undefined && ts.isStringLiteralLike(expression) ? expression.text : undefined;

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

/** Every body a file registers: a tab's `body`, a `single` context's `body` and a collection's `body` context's `render`. */
function contextBodiesIn(sf: ts.SourceFile): readonly ContextBody[] {
  const found: ContextBody[] = [];
  const line = (node: ts.Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  visit(sf, (node) => {
    if (!ts.isObjectLiteralExpression(node)) {
      return;
    }
    const body = propertyOf(node, "body");
    const id = literalOf(propertyOf(node, "id"));
    if (body !== undefined && id !== undefined && isTabDefinition(node)) {
      found.push({ label: id, line: line(node), draw: body });
      return;
    }
    const kind = literalOf(propertyOf(node, "kind"));
    const slot = kind === undefined ? undefined : BODY_CONTEXTS.get(kind);
    const draw = slot === undefined ? undefined : propertyOf(node, slot);
    if (kind !== undefined && draw !== undefined && ts.isPropertyAssignment(node.parent) && node.parent.name.getText() === "context") {
      found.push({ label: `${kind} context`, line: line(node), draw });
    }
  });
  return found;
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
  const tree = { facts, elems: bodyElems(facts, body.draw) };
  const owner = renderedTag(tree, CONTEXT_TAB_BODY, byPath, 0);
  // The columns the body's own component answers are read on the first component the registration mounts.
  const drawn = mounted(facts, tree.elems, byPath)[0]?.facts ?? facts;
  return member(facts, body.label, {
    root: cell(owner === null ? HAND_BUILT_ROOT : `${CONTEXT_TAB_BODY} ${attrString(owner.attrs.get("kind")) ?? "sections"}`, body.line),
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

/** Every composition cohort over the client's TSX files. */
export function buildCohorts(all: readonly FileFacts[]): readonly Cohort[] {
  const client = all.filter((facts) => facts.source.layer === "client");
  const byPath = new Map(client.map((facts) => [facts.source.path, facts]));
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
      members: client.flatMap((facts) =>
        facts.source.sf === null ? [] : contextBodiesIn(facts.source.sf).map((body) => contextBodyMember(facts, body, byPath)),
      ),
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
