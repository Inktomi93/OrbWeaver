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

function focusAndEmpty(facts: FileFacts): Record<string, Cell> {
  return {
    focus: cell(FOCUS_HOOKS.filter((hook) => facts.calls.has(hook)).join("+") || "none", 1),
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

const SLOT_HOPS = 3;
const LIBRARY_SHELL = "LibrarySurfaceShell";

/** The file a relative import names; this tree writes the extension in every specifier. */
const importedFile = (path: string, specifier: string): string => posix.normalize(posix.join(posix.dirname(path), specifier));

/** The `surfaces/` files a component tree reaches from its elements, through anchors and wrappers up to the hop limit. */
function surfacesReached(facts: FileFacts, elems: readonly Elem[], byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  return elems.flatMap((elem) => {
    const specifier = facts.relativeImports.get(elem.tag);
    const target = specifier === undefined ? undefined : byPath.get(importedFile(facts.source.path, specifier));
    if (target === undefined) {
      return [];
    }
    if (target.source.path.includes("/surfaces/")) {
      return [target.source.path];
    }
    // Only the mounted component's own body: a file can hold the LIST and the CONTENT component side by side.
    const body = target.source.sf === null ? undefined : componentsIn(target.source.sf).find(([name]) => name === elem.tag)?.[1];
    const inBody = body === undefined ? [] : target.elems.filter((inner) => inner.opening.pos >= body.pos && inner.opening.end <= body.end);
    return hops >= SLOT_HOPS ? [] : surfacesReached(target, inBody, byPath, hops + 1);
  });
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
  const sf = facts.source.sf;
  if (sf !== null && componentsIn(sf).some(([name]) => HEADER_TEMPLATES.has(name))) {
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
  const slotted = listSlotSurfaces(feature, byPath);
  const lists = feature.filter((facts) => slotted.has(facts.source.path));
  const context = feature.filter((facts) => /(?:^|\/)(?:[a-z-]*context-tabs|[a-z-]*-context-body)\.tsx$/u.test(facts.source.path));
  const editors = client.filter((facts) => facts.tags.has("EditorPage") || /(?:^|\/)[a-z-]*editor[a-z-]*\.tsx$/u.test(facts.source.path));
  return [
    {
      name: "list-pane",
      what: "LIST surfaces: template, shell, row composite, skipTo, focus hook, empty state",
      columns: ["template", "shell", "rows", "skipTo", "focus", "empty"],
      defects: { rows: ["raw ListRow"] },
      kept: {
        shell: {
          [LIBRARY_SHELL]:
            "a small bounded list read whole in one useSuspenseQuery uses LibrarySurfaceShell in a ListPage; paginated implies the collection factory (client-architecture-state-and-gates.md §14, Browse)",
        },
      },
      keptSites: {
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
