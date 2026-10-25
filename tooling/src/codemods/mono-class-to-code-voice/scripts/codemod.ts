// Replaces the `font-mono` class token on a `<Text>` with `voice="code"`: `<Text voice="label" className="font-mono x">`
// → `<Text voice="code" className="x">`, and a Text with no voice gains one. A Text with another voice, a
// non-literal voice or className, or a conditional token stays untouched: those are judgment sites.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const MONO_TOKEN = "font-mono";
const REPLACED_VOICE = "label";
const CODE_VOICE = "code";

const TEXT_OPENING: RuleConfig<TSX> = {
  rule: { any: [{ kind: "jsx_opening_element" }, { kind: "jsx_self_closing_element" }] },
};

export const getSelector: GetSelector<TSX> = () => TEXT_OPENING;

function attributeNamed(element: SgNode<TSX>, name: string): SgNode<TSX> | undefined {
  return element.children().find((child) => child.kind() === "jsx_attribute" && child.child(0)?.text() === name);
}

/** The attribute's value when it is a bare string literal (`name="x"`), else undefined. */
function literalOf(attribute: SgNode<TSX>): SgNode<TSX> | undefined {
  const value = attribute.child(2);
  return value?.kind() === "string" ? value : undefined;
}

function rewrite(element: SgNode<TSX>): readonly Edit[] {
  if (element.child(1)?.text() !== "Text") {
    return [];
  }
  const classAttribute = attributeNamed(element, "className");
  const classLiteral = classAttribute === undefined ? undefined : literalOf(classAttribute);
  if (classAttribute === undefined || classLiteral === undefined) {
    return [];
  }
  const tokens = classLiteral
    .text()
    .slice(1, -1)
    .split(/\s+/u)
    .filter((token) => token !== "");
  if (!tokens.includes(MONO_TOKEN)) {
    return [];
  }
  const kept = tokens.filter((token) => token !== MONO_TOKEN);
  const voiceAttribute = attributeNamed(element, "voice");
  const voiceLiteral = voiceAttribute === undefined ? undefined : literalOf(voiceAttribute);
  if (voiceAttribute !== undefined && voiceLiteral?.text().slice(1, -1) !== REPLACED_VOICE) {
    return [];
  }
  const edits: Edit[] = [];
  const range = classAttribute.range();
  if (kept.length === 0) {
    edits.push({ startPos: range.start.index, endPos: range.end.index, insertedText: voiceAttribute === undefined ? `voice="${CODE_VOICE}"` : "" });
  } else {
    edits.push(classLiteral.replace(`"${kept.join(" ")}"`));
    if (voiceAttribute === undefined) {
      edits.push({ startPos: range.start.index, endPos: range.start.index, insertedText: `voice="${CODE_VOICE}" ` });
    }
  }
  if (voiceLiteral !== undefined) {
    edits.push(voiceLiteral.replace(`"${CODE_VOICE}"`));
  }
  return edits;
}

const codemod: Codemod<TSX> = (root, options) => {
  const rootNode = root.root();
  const elements = options.matches ?? rootNode.findAll(TEXT_OPENING);
  const edits = elements.flatMap(rewrite);
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
