// Rewrites `<Text voice="gloss" className="font-mono x">` to `<Text voice="datumMono" className="x">`: the voice owns the
// mono face, so the token goes. Only a plain string className is touched; a className in an expression is a judgment site.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const MONO_TOKEN = "font-mono";
const TEXT_ELEMENT = "Text";

const JSX_ATTRIBUTE: RuleConfig<TSX> = { rule: { kind: "jsx_attribute" } };

export const getSelector: GetSelector<TSX> = () => JSX_ATTRIBUTE;

function attributeName(attribute: SgNode<TSX>): string | undefined {
  return attribute.child(0)?.text();
}

/** The attribute's value when it is a bare string literal, else undefined. */
function literalValue(attribute: SgNode<TSX>): SgNode<TSX> | undefined {
  const value = attribute.child(2);
  return value !== null && value.kind() === "string" ? value : undefined;
}

function rewriteClassName(attribute: SgNode<TSX>, literal: SgNode<TSX>): Edit {
  const quote = literal.text().slice(0, 1);
  const kept = literal
    .text()
    .slice(1, -1)
    .split(/\s+/u)
    .filter((token) => token !== "" && token !== MONO_TOKEN);
  if (kept.length === 0) {
    const range = attribute.range();
    return { startPos: range.start.index, endPos: range.end.index, insertedText: "" };
  }
  return literal.replace(`${quote}${kept.join(" ")}${quote}`);
}

function monoGlossEdits(attribute: SgNode<TSX>): readonly Edit[] {
  const element = attribute.parent();
  if (attributeName(attribute) !== "className" || element === null || element.child(1)?.text() !== TEXT_ELEMENT) {
    return [];
  }
  const classLiteral = literalValue(attribute);
  if (classLiteral === undefined || !classLiteral.text().slice(1, -1).split(/\s+/u).includes(MONO_TOKEN)) {
    return [];
  }
  const voice = element.children().find((child) => child.kind() === "jsx_attribute" && attributeName(child) === "voice");
  const voiceLiteral = voice === undefined ? undefined : literalValue(voice);
  if (voiceLiteral === undefined || voiceLiteral.text().slice(1, -1) !== "gloss") {
    return [];
  }
  const quote = voiceLiteral.text().slice(0, 1);
  return [rewriteClassName(attribute, classLiteral), voiceLiteral.replace(`${quote}datumMono${quote}`)];
}

const codemod: Codemod<TSX> = (root, options) => {
  const rootNode = root.root();
  const attributes = options.matches ?? rootNode.findAll(JSX_ATTRIBUTE);
  const edits = attributes.flatMap(monoGlossEdits);
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
