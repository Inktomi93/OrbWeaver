// Form shape: autosave factory against explicit submit per file, and the dismiss words beside each.
// Law: an autosave form closes with Close, Done or Back; Cancel abandons unsubmitted input, so it belongs to an explicit submit.
import ts from "typescript";
import type { Elem, FileFacts, Source } from "../eslint/index.ts";
import { attrString, childrenText, firstLine, visit } from "../eslint/index.ts";
import type { Cohort, Member } from "../floor/verdict/cohort-compare.ts";

const FACTORY_MODES: Readonly<Record<string, string>> = { createAutosaveEntityForm: "autosave", createSavedEntityForm: "saved" };
const WORDS = ["Back", "Cancel", "Close", "Done"] as const;
const BUTTONS = new Set(["Button", "GlyphButton", "InlineAction", "DialogClose"]);

export interface FormScan {
  readonly factories: number;
  readonly files: number;
}

/** Hook and boundary names minted by a form factory, with the mode of the factory. */
export function formFactories(sources: readonly Source[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const source of sources) {
    const sf = source.sf;
    if (sf === null || source.layer !== "client") {
      continue;
    }
    visit(sf, (node) => {
      const init = ts.isVariableDeclaration(node) ? node.initializer : undefined;
      const mode = init !== undefined && ts.isCallExpression(init) && ts.isIdentifier(init.expression) ? FACTORY_MODES[init.expression.text] : undefined;
      if (mode !== undefined && ts.isVariableDeclaration(node)) {
        names.set(node.name.getText(sf), mode);
      }
    });
  }
  return names;
}

function modeOf(facts: FileFacts, factories: ReadonlyMap<string, string>): string | null {
  const modes = new Set<string>();
  for (const name of [...facts.calls, ...facts.tags, ...facts.relativeImports.keys()]) {
    const mode = factories.get(name) ?? FACTORY_MODES[name];
    if (mode !== undefined) {
      modes.add(mode);
    }
  }
  if (modes.size === 0) {
    return facts.calls.has("useAppForm") ? "hand-wired" : null;
  }
  return modes.size === 1 ? ([...modes][0] ?? null) : "mixed";
}

function dismissWords(elems: readonly Elem[]): readonly string[] {
  const found = new Set<string>();
  for (const elem of elems) {
    const text = BUTTONS.has(elem.tag) ? childrenText(elem.element) : null;
    const word = WORDS.find((entry) => entry === text || entry === attrString(elem.attrs.get("dismissLabel")));
    if (word !== undefined) {
      found.add(word);
    }
    // These composites print a Cancel of their own.
    if (elem.tag === "FormDialog" || elem.tag === "FormDialogPopup") {
      found.add("Cancel");
    }
  }
  return WORDS.filter((word) => found.has(word));
}

function submitOf(facts: FileFacts): string {
  if (facts.tags.has("SaveBar")) {
    return "SaveBar";
  }
  if (facts.tags.has("FormDialog") || facts.tags.has("FormDialogPopup")) {
    return "FormDialog";
  }
  return facts.elems.some((elem) => attrString(elem.attrs.get("type")) === "submit") ? "submit button" : "none";
}

function fitOf(mode: string, words: readonly string[]): string {
  if (mode === "autosave" && words.includes("Cancel")) {
    return "autosave says Cancel";
  }
  return mode === "saved" && !words.includes("Cancel") && words.length > 0 ? "explicit says Close/Done/Back" : "ok";
}

function memberOf(facts: FileFacts, mode: string): Member {
  const words = dismissWords(facts.elems);
  const line = firstLine(facts, "SaveBar", "FormDialog", "FormDialogPopup");
  return {
    path: facts.source.path,
    section: facts.source.section,
    label: "file",
    cells: {
      mode: { value: mode, line },
      submit: { value: submitOf(facts), line },
      dismiss: { value: words.join("+") || "none", line },
      fit: { value: fitOf(mode, words), line },
    },
  };
}

export function buildFormCohort(all: readonly FileFacts[], factories: ReadonlyMap<string, string>): { readonly cohort: Cohort; readonly scan: FormScan } {
  const client = all.filter((facts) => facts.source.layer === "client");
  const members = client.flatMap((facts) => {
    const mode = modeOf(facts, factories);
    return mode === null ? [] : [memberOf(facts, mode)];
  });
  return {
    scan: { factories: factories.size, files: client.length },
    cohort: {
      name: "form",
      what: "files that build or consume a form: autosave factory, saved factory or hand-wired; submit path; dismiss words; whether the words fit the mode",
      columns: ["mode", "submit", "dismiss", "fit"],
      defects: { fit: ["autosave says Cancel"] },
      basis: { mode: "heuristic", submit: "measured", dismiss: "measured", fit: "heuristic" },
      members,
    },
  };
}
