// Rewrites a triggered `<ConfirmDialog trigger={…} …/>` to `<DestructiveAction confirm={{…}} trigger={…} …/>`: the copy moves into `confirm`.
import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const COPY_PROPS = new Set(["title", "description", "body", "confirmLabel", "cancelLabel", "confirmTone"]);

const TRIGGERED: RuleConfig<TSX> = {
  rule: {
    kind: "jsx_self_closing_element",
    has: { field: "name", regex: "^ConfirmDialog$" },
    all: [{ has: { kind: "jsx_attribute", regex: "^trigger=" } }],
  },
};

export const getSelector: GetSelector<TSX> = () => TRIGGERED;

function nameOf(attribute: SgNode<TSX>): string {
  return attribute.text().split("=")[0] ?? "";
}

function attributeValue(attribute: SgNode<TSX>): string {
  const text = attribute.text();
  const raw = text.slice(text.indexOf("=") + 1);
  return raw.startsWith("{") ? raw.slice(1, -1).trim() : raw;
}

// A triggered confirm that keeps a spread cannot be split safely; it stays for a hand move.
function rewrite(element: SgNode<TSX>): Edit | null {
  const parts = element.children();
  if (parts.some((part) => part.kind() === "jsx_expression")) {
    return null;
  }
  const attributes = parts.filter((part) => part.kind() === "jsx_attribute");
  const copy = attributes.filter((attribute) => COPY_PROPS.has(nameOf(attribute)));
  const rest = attributes.filter((attribute) => !COPY_PROPS.has(nameOf(attribute)));
  const confirm = copy.map((attribute) => `${nameOf(attribute)}: ${attributeValue(attribute)}`).join(", ");
  return element.replace(`<DestructiveAction confirm={{ ${confirm} }} ${rest.map((attribute) => attribute.text()).join(" ")} />`);
}

function importEdits(root: SgNode<TSX>): readonly Edit[] {
  const specifier = root.find({
    rule: { kind: "import_specifier", regex: "^ConfirmDialog$", inside: { kind: "import_statement", stopBy: "end", regex: '"#components"' } },
  });
  if (specifier === null) {
    return [];
  }
  const stillConfirms = root.findAll({
    rule: { kind: "jsx_self_closing_element", has: { field: "name", regex: "^ConfirmDialog$" }, not: { has: { kind: "jsx_attribute", regex: "^trigger=" } } },
  });
  return [specifier.replace(stillConfirms.length > 0 ? "ConfirmDialog, DestructiveAction" : "DestructiveAction")];
}

// `Codemod` returns a Promise; nothing here awaits, so resolve explicitly instead of marking the function async.
const codemod: Codemod<TSX> = (root, options) => {
  const rootNode = root.root();
  const matches = options.matches ?? rootNode.findAll(TRIGGERED);
  const edits = matches.map(rewrite).filter((edit): edit is Edit => edit !== null);
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  return Promise.resolve(rootNode.commitEdits([...edits, ...importEdits(rootNode)]));
};

export default codemod;
