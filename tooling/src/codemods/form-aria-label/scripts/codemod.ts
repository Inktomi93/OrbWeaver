// Adds `aria-label` to a `<form>` that has no accessible name. A name is a decision about the user's task, so the labels
// are a file-keyed map read from the target directory; a form in an unmapped file is left for a hand edit.
import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_LABELS_FILE = "codemod-form-labels.json";

const FORM_OPENING: RuleConfig<TSX> = {
  rule: {
    any: [
      { kind: "jsx_opening_element", has: { field: "name", regex: "^form$" } },
      { kind: "jsx_self_closing_element", has: { field: "name", regex: "^form$" } },
    ],
  },
};

const NAMING_ATTRIBUTE: RuleConfig<TSX> = { rule: { kind: "jsx_attribute", regex: "^(aria-label|aria-labelledby)\\b" } };

export const getSelector: GetSelector<TSX> = () => FORM_OPENING;

function readLabels(targetDir: string, labelsFile: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, labelsFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${labelsFile}: expected an object of file path to label`);
  }
  const entries = Object.entries(parsed).map(([file, label]) => {
    if (typeof label !== "string") {
      throw new Error(`${labelsFile}: ${file} maps to a non-string`);
    }
    return [file, label] as const;
  });
  return new Map(entries);
}

const codemod: Codemod<TSX> = (root, options) => {
  const labels = readLabels(options.targetDir, options.params["labels"] ?? DEFAULT_LABELS_FILE);
  const label = labels.get(root.relativeFilename());
  if (label === undefined) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const forms = options.matches ?? rootNode.findAll(FORM_OPENING);
  // A label that opens with `{` is an expression the file already has in scope; anything else is literal text.
  const value = label.startsWith("{") ? label : JSON.stringify(label);
  const edits: Edit[] = [];
  for (const form of forms) {
    const name = form.field("name");
    if (name !== null && form.find(NAMING_ATTRIBUTE) === null) {
      edits.push(name.replace(`${name.text()} aria-label=${value}`));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
