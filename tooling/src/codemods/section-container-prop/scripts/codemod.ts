// Rewrites `<Section className="@container" …>` to `<Section container={true} …>`: the section writes its own container class.
import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

// Only the exact class: a Section carrying other classes keeps them and is reviewed by hand.
const CONTAINER_CLASS = {
  rule: {
    kind: "jsx_attribute",
    regex: "^className=[\"']@container[\"']$",
    inside: { kind: "jsx_opening_element", has: { field: "name", regex: "^Section$" } },
  },
} as const;

export const getSelector: GetSelector<TSX> = () => CONTAINER_CLASS;

// `Codemod` returns a Promise; nothing here awaits, so resolve explicitly instead of marking the function async.
const codemod: Codemod<TSX> = (root, options) => {
  const rootNode = root.root();
  const matches = options.matches ?? rootNode.findAll(CONTAINER_CLASS);
  if (matches.length === 0) {
    return Promise.resolve(null);
  }
  const edits: Edit[] = matches.map((node) => node.replace("container={true}"));
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
