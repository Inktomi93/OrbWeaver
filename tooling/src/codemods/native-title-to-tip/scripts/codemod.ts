// Moves a native `title` that only repeats an element's accessible name or its sole child off the element,
// for `orb/no-native-title`. A title that carries anything else is left for a hand edit; the lint reports it.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const TITLE_ATTRIBUTE = {
  rule: { kind: "jsx_attribute", has: { kind: "property_identifier", regex: "^title$" } },
} as const;

const TIP_NAME = "Tip";

const TIP_MODULE = "#components";

/** Pre-filter so the transform runs only for files that spell a JSX `title`. */
export const getSelector: GetSelector<TSX> = () => TITLE_ATTRIBUTE;

function attributeName(attribute: SgNode<TSX>): string | undefined {
  return attribute
    .children()
    .find((child) => child.kind() === "property_identifier")
    ?.text();
}

/** The value as written: `"text"` or `{expression}`. */
function attributeValue(attribute: SgNode<TSX>): string | undefined {
  return attribute
    .children()
    .find((child) => child.kind() === "string" || child.kind() === "jsx_expression")
    ?.text();
}

function attributes(owner: SgNode<TSX>): SgNode<TSX>[] {
  return owner.children().filter((child) => child.kind() === "jsx_attribute");
}

function findAttribute(owner: SgNode<TSX>, name: string): SgNode<TSX> | undefined {
  return attributes(owner).find((attribute) => attributeName(attribute) === name);
}

/** Delete an attribute with the whitespace that separates it from its previous sibling. */
function deletion(attribute: SgNode<TSX>): Edit {
  const previous = attribute.prev();
  const start = previous === null ? attribute.range().start.index : previous.range().end.index;
  return { startPos: start, endPos: attribute.range().end.index, insertedText: "" };
}

/** A string title equals the element's text child; an expression title equals its one expression child. */
function repeatsSoleChild(element: SgNode<TSX>, value: string): boolean {
  if (element.kind() !== "jsx_element") {
    return false;
  }
  const content = element
    .children()
    .filter((child) => child.kind() !== "jsx_opening_element" && child.kind() !== "jsx_closing_element" && child.text().trim() !== "");
  if (content.length !== 1) {
    return false;
  }
  const [only] = content;
  if (only === undefined) {
    return false;
  }
  if (only.kind() === "jsx_expression") {
    return only.text() === value;
  }
  return only.kind() === "jsx_text" && value.startsWith('"') && `"${only.text().trim()}"` === value;
}

/** An element passed as a prop (`trigger={<Button/>}`, `render={…}`) must stay one element: wrapping it breaks the prop merge. */
function isPropValue(element: SgNode<TSX>): boolean {
  return element.parent()?.kind() === "jsx_expression" && element.parent()?.parent()?.kind() === "jsx_attribute";
}

/** Add `Tip` to the `#components` import, or add that import after the last one. */
function tipImport(rootNode: SgNode<TSX>): Edit | undefined {
  const imports = rootNode.children().filter((child) => child.kind() === "import_statement");
  const existing = imports.find((statement) => statement.field("source")?.text() === `"${TIP_MODULE}"` && statement.text().startsWith("import {"));
  if (existing !== undefined) {
    const named = existing.find({ rule: { kind: "named_imports" } });
    if (named === null || named.findAll({ rule: { kind: "import_specifier" } }).some((specifier) => specifier.text() === TIP_NAME)) {
      return undefined;
    }
    const open = named.range().start.index + 1;
    return { startPos: open, endPos: open, insertedText: ` ${TIP_NAME},` };
  }
  const last = imports.at(-1);
  const at = last === undefined ? 0 : last.range().end.index;
  return { startPos: at, endPos: at, insertedText: `\nimport { ${TIP_NAME} } from "${TIP_MODULE}";` };
}

/** Wrap a name-repeating control in `Tip`, moving its `key` onto the wrapper. */
function wrapEdits(owner: SgNode<TSX>, element: SgNode<TSX>, value: string): Edit[] {
  // The tooltip text IS the name, so the seal shows it on hover and adds no description.
  const key = findAttribute(owner, "key");
  const keyText = key === undefined ? "" : ` ${key.text()}`;
  const start = element.range().start.index;
  const end = element.range().end.index;
  return [
    ...(key === undefined ? [] : [deletion(key)]),
    { startPos: start, endPos: start, insertedText: `<${TIP_NAME}${keyText} text=${value}>` },
    { startPos: end, endPos: end, insertedText: `</${TIP_NAME}>` },
  ];
}

/** The edits one `title` attribute earns; an empty list leaves it for a hand edit. */
function titleEdits(title: SgNode<TSX>): Edit[] {
  const value = attributeValue(title);
  const owner = title.parent();
  const element = owner?.kind() === "jsx_opening_element" ? owner.parent() : owner;
  if (value === undefined || owner === null || element === null) {
    return [];
  }
  const name = findAttribute(owner, "aria-label");
  if (name !== undefined && attributeValue(name) === value) {
    return [deletion(title), ...(isPropValue(element) ? [] : wrapEdits(owner, element, value))];
  }
  return repeatsSoleChild(element, value) ? [deletion(title)] : [];
}

const codemod: Codemod<TSX> = (root, options) => {
  const rootNode = root.root();
  const titles = options.matches ?? rootNode.findAll(TITLE_ATTRIBUTE);
  const edits = titles.flatMap(titleEdits);
  const wrapped = edits.some((edit) => edit.insertedText.startsWith(`<${TIP_NAME}`));
  if (wrapped) {
    const addition = tipImport(rootNode);
    if (addition !== undefined) {
      edits.push(addition);
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
