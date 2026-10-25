// Only the appearance glass recipes move; unrelated filters and the reduced-transparency reset stay intact.
import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type CSS from "codemod:ast-grep/langs/css";

const FILTER: RuleConfig<CSS> = { rule: { kind: "declaration", has: { kind: "property_name", regex: "^backdrop-filter$" } } };
const FULL = "backdrop-filter: blur(calc(var(--appearance-blur-strength) * 1px)) saturate(var(--blur-saturate));";
const HALF = "backdrop-filter: blur(calc((var(--appearance-blur-strength) * 1px) / 2)) saturate(var(--blur-saturate));";
export const getSelector: GetSelector<CSS> = () => FILTER;

const codemod: Codemod<CSS> = (root, options) => {
  const edits: Edit[] = [];
  for (const node of options.matches ?? root.root().findAll(FILTER)) {
    const value = node.text();
    if (value === FULL || value === HALF) {
      edits.push(node.replace(`${value === HALF ? "--glass-blur-scale: 0.5;\n" : ""}backdrop-filter: var(--glass-filter);`));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : root.root().commitEdits(edits));
};

export default codemod;
