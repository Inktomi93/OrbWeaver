// The composition cohorts (area C): which template, row composite, dialog anatomy, dismiss path and confirm each section uses.

import { posix } from "node:path";
import ts from "typescript";
import type { Elem, FileFacts } from "../eslint/index.ts";
import { attrString, buttonWithText, childrenText, componentsIn, DESTRUCTIVE_EXEMPT, firstLine, hasAny, insideTag, visit } from "../eslint/index.ts";
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
  } else if (rendersTag({ facts, elems: facts.elems }, EMPTY_STATE, byPath, 0)) {
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

const SLOT_HOPS = 3;
const LIBRARY_SHELL = "LibrarySurfaceShell";

/** The file a relative import names; this tree writes the extension in every specifier. */
const importedFile = (path: string, specifier: string): string => posix.normalize(posix.join(posix.dirname(path), specifier));

interface Rendered {
  readonly facts: FileFacts;
  /** The elements of the one component the element mounts, not of its whole file. */
  readonly elems: readonly Elem[];
}

const COMPONENTS_DOOR = "#components";
const COMPONENTS_DIR = "packages/client/src/components/";
const composites = new WeakMap<ReadonlyMap<string, FileFacts>, ReadonlyMap<string, FileFacts>>();

/** The `#components` composite each name is declared in, read once per file map. */
function compositeFiles(byPath: ReadonlyMap<string, FileFacts>): ReadonlyMap<string, FileFacts> {
  const known = composites.get(byPath);
  if (known !== undefined) {
    return known;
  }
  const byName = new Map<string, FileFacts>();
  for (const [path, facts] of byPath) {
    if (path.startsWith(COMPONENTS_DIR) && facts.source.sf !== null) {
      for (const [name] of componentsIn(facts.source.sf)) {
        byName.set(name, facts);
      }
    }
  }
  composites.set(byPath, byName);
  return byName;
}

/** The client component each element mounts, through a relative import or the `#components` door, with that component's own body. */
function mounted(facts: FileFacts, elems: readonly Elem[], byPath: ReadonlyMap<string, FileFacts>): readonly Rendered[] {
  return elems.flatMap((elem) => {
    const specifier = facts.relativeImports.get(elem.tag);
    const fromDoor = elem.imported?.source === COMPONENTS_DOOR ? compositeFiles(byPath).get(elem.imported.name) : undefined;
    const target = specifier === undefined ? fromDoor : byPath.get(importedFile(facts.source.path, specifier));
    if (target === undefined) {
      return [];
    }
    return [{ facts: target, elems: componentTree(target, elem.tag) }];
  });
}

/** The elements of one component's body and of the same-file components it renders, never the file's other components. */
function componentTree(facts: FileFacts, root: string): readonly Elem[] {
  // Only the mounted component's own tree: a file can hold the LIST and the CONTENT component side by side.
  const bodies = new Map(facts.source.sf === null ? [] : componentsIn(facts.source.sf));
  const seen = new Set<string>();
  const walk = (name: string): readonly Elem[] => {
    const body = bodies.get(name);
    if (body === undefined || seen.has(name)) {
      return [];
    }
    seen.add(name);
    const own = facts.elems.filter((inner) => inner.opening.pos >= body.pos && inner.opening.end <= body.end);
    return [...own, ...own.flatMap((inner) => walk(inner.tag))];
  };
  return walk(root);
}

/** The `surfaces/` files a component tree reaches from its elements, through anchors and wrappers up to the hop limit. */
function surfacesReached(facts: FileFacts, elems: readonly Elem[], byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  return mounted(facts, elems, byPath).flatMap((next) => {
    if (next.facts.source.path.includes("/surfaces/")) {
      return [next.facts.source.path];
    }
    return hops >= SLOT_HOPS ? [] : surfacesReached(next.facts, next.elems, byPath, hops + 1);
  });
}

/** Whether the tree renders the tag, itself or in a component it mounts, up to the hop limit. */
function rendersTag(tree: Rendered, tag: string, byPath: ReadonlyMap<string, FileFacts>, hops: number): boolean {
  if (tree.elems.some((elem) => elem.tag === tag)) {
    return true;
  }
  return hops < SLOT_HOPS && mounted(tree.facts, tree.elems, byPath).some((next) => rendersTag(next, tag, byPath, hops + 1));
}

/** LIST panes are the surfaces a section, a Corpus mode or another definition mounts in its `list` slot, not a file name. */
function listSlotSurfaces(feature: readonly FileFacts[], byPath: ReadonlyMap<string, FileFacts>): ReadonlySet<string> {
  const found = new Set<string>();
  for (const facts of feature) {
    const sf = facts.source.sf;
    if (sf === null || !facts.source.path.includes("/lib/")) {
      continue;
    }
    visit(sf, (node) => {
      if (!(ts.isPropertyAssignment(node) && node.name.getText() === "list")) {
        return;
      }
      const inSlot = facts.elems.filter((elem) => elem.opening.pos >= node.initializer.pos && elem.opening.end <= node.initializer.end);
      for (const path of surfacesReached(facts, inSlot, byPath, 0)) {
        found.add(path);
      }
    });
  }
  return found;
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

function contextTab(facts: FileFacts, byPath: ReadonlyMap<string, FileFacts>): Member {
  const tabs = [...facts.tags].filter((tag) => /^Tabs?[A-Z]?/u.test(tag) && facts.elems.some((elem) => elem.tag === tag && elem.kind === "ui")).sort();
  const mutations = [...facts.calls].filter((call) => MUTATION_FACTORIES.has(call));
  return member(facts, "file", {
    tabs: cell(tabs.length === 0 ? "none" : tabs.join("+"), firstLine(facts, ...tabs)),
    inlineMutations: cell(mutations.length === 0 ? "none" : "defined in the component file", 1),
    confirm: cell(
      hasAny(facts, "ConfirmDialog", "DestructiveAction", "AlertDialog") ? CONFIRM_DIALOG : "none",
      firstLine(facts, "ConfirmDialog", "DestructiveAction"),
    ),
    ...focusAndEmpty(facts, byPath),
  });
}

const EDITOR_TEMPLATE: ReadonlySet<string> = new Set(["EditorPage"]);

// The editor column's signature, as `orb/page-template-shapes` reads it.
const handSpelledColumn = (facts: FileFacts): boolean => facts.source.text.includes("mx-auto") && facts.source.text.includes("max-inline-(--width-content-col");

function editor(facts: FileFacts, byPath: ReadonlyMap<string, FileFacts>): Member {
  const page = facts.elems.find((elem) => elem.tag === "EditorPage");
  const handColumn = handSpelledColumn(facts);
  let template = "none";
  if (page !== undefined) {
    template = `EditorPage kind=${attrString(page.attrs.get("kind")) ?? "form"}`;
  } else if (handColumn) {
    template = "hand-spelled column";
  } else if (rendersTag({ facts, elems: facts.elems }, "EditorPage", byPath, 0)) {
    template = "EditorPage in a mounted component";
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
  const slotted = listSlotSurfaces(feature, byPath);
  const lists = feature.filter((facts) => slotted.has(facts.source.path));
  const context = feature.filter((facts) => /(?:^|\/)(?:[a-z-]*context-tabs|[a-z-]*-context-body)\.tsx$/u.test(facts.source.path));
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
          "packages/client/src/features/config/surfaces/config-list-surface.tsx":
            "the Settings map renders every registered group, populated or not, so it has no empty arm (config-list-surface.tsx header)",
        },
        focus: {
          "packages/client/src/features/discovery/surfaces/corpus-list-surface.tsx":
            "arrival lands on the omnibox, because the search is the surface (corpus-list-surface.tsx `CorpusListSurface` focus ruling)",
          "packages/client/src/features/config/surfaces/config-list-surface.tsx":
            "arrival lands on the active group's band, the map that owns the section's arrival (config-list-surface.tsx focus ruling)",
          "packages/client/src/features/tag/surfaces/labels-list-surface.tsx":
            "the Labels finder owns phone arrival and the visible library owns desktop arrival (labels-list-surface.tsx header)",
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
      name: "context-tab",
      what: "context tab bodies: Tabs shape, mutation home, confirm, focus hook, empty state",
      columns: ["tabs", "inlineMutations", "confirm", "focus", "empty"],
      defects: { inlineMutations: ["defined in the component file"] },
      kept: {
        confirm: {
          [CONFIRM_DIALOG]:
            "a tab that holds a destructive verb confirms it through DestructiveAction or a controlled ConfirmDialog (client-architecture-state-and-gates.md §14, Destructive confirms)",
        },
        empty: { [EMPTY_IN_CHILD]: "the empty state is designed in the component the tab body mounts (client-architecture-state-and-gates.md §11)" },
      },
      members: context.map((facts) => contextTab(facts, byPath)),
    },
    {
      name: "editor",
      what: "editors: page template, save path, focus hook, empty state",
      columns: ["template", "save", "focus", "empty"],
      defects: { template: ["hand-spelled column"] },
      kept: {
        template: {
          "EditorPage kind=instrument":
            "a control-track instrument holds the narrow cap through its `instrument` kind (packages/client/src/components/editor-page.tsx)",
          "EditorPage in a mounted component": "the surface mounts the body that renders the template",
        },
        save: {
          [SAVE_BAR]:
            "the character editor's sticky identity bar carries the autosave status; it saves as you type, with no Save or Discard (D66; character-editor-surface.tsx header)",
        },
        focus: { [FOCUS_IN_CHILD]: "the editor body the surface mounts takes arrival focus (tag-member-surface.tsx focus ruling)" },
        empty: {
          [EMPTY_STATE]:
            "a member surface draws its deleted-member arm as a designed empty state (packages/client/src/components/member-drill-header.tsx `title`)",
        },
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
