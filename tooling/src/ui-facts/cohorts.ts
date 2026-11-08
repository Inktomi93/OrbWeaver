// The composition cohorts (area C): which template, row composite, dialog anatomy, dismiss path and confirm each section uses.

import type { Elem, FileFacts } from "../eslint/index.ts";
import { attrString, buttonWithText, childrenText, DESTRUCTIVE_EXEMPT, firstLine, hasAny, insideTag } from "../eslint/index.ts";
import type { Cell, Cohort, Member } from "../floor/verdict/cohort-compare.ts";
import { NOT_APPLICABLE } from "../floor/verdict/cohort-compare.ts";

const cell = (value: string, line: number): Cell => ({ value, line });
const yesNo = (flag: boolean): string => (flag ? "yes" : "no");

function member(facts: FileFacts, label: string, cells: Record<string, Cell>): Member {
  return { path: facts.source.path, section: facts.source.section, label, cells };
}

function focusAndEmpty(facts: FileFacts): Record<string, Cell> {
  return {
    focus: cell(facts.calls.has("useFocusOnMount") ? "useFocusOnMount" : "none", 1),
    empty: cell(facts.tags.has("EmptyState") ? "EmptyState" : "none", firstLine(facts, "EmptyState")),
  };
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
    shell: cell(facts.tags.has("LibrarySurfaceShell") ? "LibrarySurfaceShell" : "none", firstLine(facts, "LibrarySurfaceShell")),
    rows: rowComposite(facts, byPath),
    skipTo: cell(listPage === undefined ? NOT_APPLICABLE : yesNo(listPage.attrs.has("skipTo")), listPage?.line ?? 1),
    ...focusAndEmpty(facts),
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

function fileDismiss(facts: FileFacts): string | null {
  if (hasAny(facts, "DialogClose", "AlertDialogClose")) {
    return "DialogClose";
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

function headerMembers(facts: FileFacts): readonly Member[] {
  const out: Member[] = [];
  for (const elem of facts.elems) {
    const isTemplate = elem.tag === "DetailHeader" || elem.tag === "MemberDrillHeader";
    if (!(isTemplate || elem.attrs.has("data-shell-identity"))) {
      continue;
    }
    out.push(
      member(facts, elem.tag, {
        header: cell(isTemplate ? elem.tag : "hand-built data-shell-identity", elem.line),
        deferToShell: cell(isTemplate ? yesNo(elem.attrs.has("deferToShell")) : NOT_APPLICABLE, elem.line),
        step: cell(elem.tag === "DetailHeader" ? (attrString(elem.attrs.get("step")) ?? "title") : NOT_APPLICABLE, elem.line),
      }),
    );
  }
  return out;
}

const MUTATION_FACTORIES = new Set(["createEntityMutation", "useMutation"]);

function contextTab(facts: FileFacts): Member {
  const tabs = [...facts.tags].filter((tag) => /^Tabs?[A-Z]?/u.test(tag) && facts.elems.some((elem) => elem.tag === tag && elem.kind === "ui")).sort();
  const mutations = [...facts.calls].filter((call) => MUTATION_FACTORIES.has(call));
  return member(facts, "file", {
    tabs: cell(tabs.length === 0 ? "none" : tabs.join("+"), firstLine(facts, ...tabs)),
    inlineMutations: cell(mutations.length === 0 ? "none" : "defined in the component file", 1),
    confirm: cell(
      hasAny(facts, "ConfirmDialog", "DestructiveAction", "AlertDialog") ? "ConfirmDialog" : "none",
      firstLine(facts, "ConfirmDialog", "DestructiveAction"),
    ),
    ...focusAndEmpty(facts),
  });
}

function editor(facts: FileFacts): Member {
  const page = facts.elems.find((elem) => elem.tag === "EditorPage");
  const handColumn = facts.source.text.includes("mx-auto") && facts.source.text.includes("max-inline-(--width-content-col");
  let template = "none";
  if (page !== undefined) {
    template = `EditorPage kind=${attrString(page.attrs.get("kind")) ?? "form"}`;
  } else if (handColumn) {
    template = "hand-spelled column";
  }
  let submit = "none";
  if (hasAny(facts, "SaveBar")) {
    submit = "SaveBar";
  } else if (hasAny(facts, "FormDialog", "FormDialogPopup")) {
    submit = "FormDialog";
  }
  return member(facts, "file", {
    template: cell(template, page?.line ?? 1),
    save: cell(submit, firstLine(facts, "SaveBar", "FormDialog", "FormDialogPopup")),
    ...focusAndEmpty(facts),
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
  const lists = feature.filter((facts) => /\/surfaces\/[^/]*(?:list|library)-surface\.tsx$/u.test(facts.source.path));
  const context = feature.filter((facts) => /(?:^|\/)(?:[a-z-]*context-tabs|[a-z-]*-context-body)\.tsx$/u.test(facts.source.path));
  const editors = client.filter((facts) => facts.tags.has("EditorPage") || /(?:^|\/)[a-z-]*editor[a-z-]*\.tsx$/u.test(facts.source.path));
  return [
    {
      name: "list-pane",
      what: "LIST surfaces: template, shell, row composite, skipTo, focus hook, empty state",
      columns: ["template", "shell", "rows", "skipTo", "focus", "empty"],
      defects: { rows: ["raw ListRow"] },
      members: lists.map((facts) => listPane(facts, byPath)),
    },
    {
      name: "detail-header",
      what: "detail headers: component, deferToShell, step",
      columns: ["header", "deferToShell", "step"],
      members: client.flatMap(headerMembers),
    },
    {
      name: "dialog",
      what: "dialogs: composite, dismiss path, submit label, title, size",
      columns: ["dismiss", "size"],
      info: ["composite", "submit"],
      defects: { dismiss: ["none"] },
      members: client.flatMap((facts) =>
        facts.elems.filter((elem) => DIALOG_TAGS.has(elem.tag) && elem.kind !== "raw").map((elem) => dialogMember(facts, elem)),
      ),
    },
    {
      name: "context-tab",
      what: "context tab bodies: Tabs shape, mutation home, confirm, focus hook, empty state",
      columns: ["tabs", "inlineMutations", "confirm", "focus", "empty"],
      defects: { inlineMutations: ["defined in the component file"] },
      members: context.map(contextTab),
    },
    {
      name: "editor",
      what: "editors: page template, save path, focus hook, empty state",
      columns: ["template", "save", "focus", "empty"],
      members: editors.map(editor),
    },
    {
      name: "row-menu",
      what: "row action menus: destructive arm, prop signature",
      columns: ["destructive", "attrs"],
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
