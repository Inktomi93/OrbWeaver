// Layer rank is declared separately; consolidating top-level blocks preserves source order inside each layer.
import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type CSS from "codemod:ast-grep/langs/css";

const LAYER: RuleConfig<CSS> = { rule: { kind: "at_rule", has: { kind: "at_keyword", regex: "^@layer$" } } };
export const getSelector: GetSelector<CSS> = () => LAYER;

const codemod: Codemod<CSS> = (root) => {
  const groups = new Map<string, { node: SgNode<CSS>; body: string }[]>();
  for (const node of root.root().children()) {
    if (!node.matches(LAYER)) {
      continue;
    }
    const name = node
      .children()
      .find((child) => child.kind() === "keyword_query")
      ?.text();
    const block = node.children().find((child) => child.kind() === "block");
    if (name === undefined || block === undefined) {
      continue;
    }
    const entries = groups.get(name) ?? [];
    entries.push({ node, body: block.text().slice(1, -1).trim() });
    groups.set(name, entries);
  }
  const edits: Edit[] = [];
  for (const [name, entries] of groups) {
    const first = entries[0];
    if (first === undefined || entries.length < 2) {
      continue;
    }
    edits.push(first.node.replace(`@layer ${name} {\n${entries.map(({ body }) => body).join("\n")}\n}`));
    for (const entry of entries.slice(1)) {
      edits.push(entry.node.replace(""));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : root.root().commitEdits(edits));
};

export default codemod;
