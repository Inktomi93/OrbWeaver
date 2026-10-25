// Moves a Row's ink token onto its leading Icon: `<Row className="text-warning gap-x"><Icon icon={A} />…</Row>` becomes
// `<Row className="gap-x"><Icon icon={A} tone="warning" />…</Row>`. A Row's own ink only ever reaches the Icon (a Text
// keeps its voice's ink), so the Icon's `tone` paints the same pixels. Rows without a leading Icon, Icons that already
// carry a `tone`, and className values that are not plain string literals stay untouched.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

/** The ink token each Icon `tone` paints (`TONE_INK` in `@orb/ui`). */
const TONE_BY_TOKEN: Readonly<Record<string, string>> = {
  "text-muted-foreground": "muted",
  "text-primary": "accent",
  "text-destructive": "destructive",
  "text-success": "success",
  "text-warning": "warning",
  "text-info": "info",
  "text-accolade": "accolade",
};

const ROW_ELEMENT: RuleConfig<TSX> = { rule: { kind: "jsx_element" } };

export const getSelector: GetSelector<TSX> = () => ROW_ELEMENT;

const ELEMENT_KINDS = new Set(["jsx_element", "jsx_self_closing_element"]);

function attributesOf(opening: SgNode<TSX>): readonly SgNode<TSX>[] {
  return opening.children().filter((child) => child.kind() === "jsx_attribute");
}

function openingOf(element: SgNode<TSX>): SgNode<TSX> | null {
  return element.kind() === "jsx_self_closing_element" ? element : element.field("open_tag");
}

function nameOf(opening: SgNode<TSX>): string {
  return opening.field("name")?.text() ?? "";
}

/** The first child that is not whitespace between tags: the element a Row leads with, if it is one. */
function leadingChild(row: SgNode<TSX>): SgNode<TSX> | undefined {
  return row.children().find((child) => {
    const kind = child.kind();
    return kind !== "jsx_opening_element" && kind !== "jsx_closing_element" && !(kind === "jsx_text" && child.text().trim() === "");
  });
}

function rewriteRow(row: SgNode<TSX>): readonly Edit[] {
  const opening = openingOf(row);
  if (opening === null || nameOf(opening) !== "Row") {
    return [];
  }
  const classAttribute = attributesOf(opening).find((attribute) => attribute.child(0)?.text() === "className");
  const literal = classAttribute?.child(2);
  if (classAttribute === undefined || literal === undefined || literal === null || literal.kind() !== "string") {
    return [];
  }
  const tokens = literal
    .text()
    .slice(1, -1)
    .split(/\s+/u)
    .filter((token) => token !== "");
  const inkTokens = tokens.filter((token) => TONE_BY_TOKEN[token] !== undefined);
  const tone = inkTokens.length === 1 ? TONE_BY_TOKEN[inkTokens[0] ?? ""] : undefined;
  const icon = leadingChild(row);
  const iconOpening = icon !== undefined && ELEMENT_KINDS.has(icon.kind()) ? openingOf(icon) : null;
  if (tone === undefined || iconOpening === null || nameOf(iconOpening) !== "Icon") {
    return [];
  }
  const iconAttributes = attributesOf(iconOpening);
  const lastAttribute = iconAttributes.at(-1);
  if (lastAttribute === undefined || iconAttributes.some((attribute) => attribute.child(0)?.text() === "tone")) {
    return [];
  }
  const remaining = tokens.filter((token) => TONE_BY_TOKEN[token] === undefined);
  const classRange = classAttribute.range();
  const previous = classAttribute.prev();
  const classEdit: Edit =
    remaining.length > 0
      ? literal.replace(`${literal.text().slice(0, 1)}${remaining.join(" ")}${literal.text().slice(-1)}`)
      : { startPos: previous === null ? classRange.start.index : previous.range().end.index, endPos: classRange.end.index, insertedText: "" };
  const insertAt = lastAttribute.range().end.index;
  return [classEdit, { startPos: insertAt, endPos: insertAt, insertedText: ` tone="${tone}"` }];
}

const codemod: Codemod<TSX> = (root, options) => {
  const rootNode = root.root();
  const rows = options.matches ?? rootNode.findAll(ROW_ELEMENT);
  const edits = rows.flatMap(rewriteRow);
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
