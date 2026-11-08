// Rewrites `<Text prose={true} …>` to `<Text cap="prose" prose={true} …>`: the prose size is a paragraph, and a paragraph takes the prose measure.
import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

// A Text that already states a cap keeps it; any other cap is a deliberate measure and is reviewed by hand.
const PROSE_WITHOUT_CAP = {
  rule: {
    kind: "jsx_attribute",
    regex: "^prose=\\{true\\}$",
    inside: {
      kind: "jsx_opening_element",
      has: { field: "name", regex: "^Text$" },
      not: { has: { kind: "jsx_attribute", regex: "^cap=" } },
    },
  },
} as const;

export const getSelector: GetSelector<TSX> = () => PROSE_WITHOUT_CAP;

// `Codemod` returns a Promise; nothing here awaits, so resolve explicitly instead of marking the function async.
const codemod: Codemod<TSX> = (root, options) => {
  const rootNode = root.root();
  const matches = options.matches ?? rootNode.findAll(PROSE_WITHOUT_CAP);
  if (matches.length === 0) {
    return Promise.resolve(null);
  }
  const edits: Edit[] = matches.map((node) => node.replace('cap="prose" prose={true}'));
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
