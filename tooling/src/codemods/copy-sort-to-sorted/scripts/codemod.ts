// Rewrites a copy-then-sort of an array, `[...x].sort(f)`, `x.slice().sort(f)` or `Array.from(x).sort(f)`, to
// `x.toSorted(f)` at the sites `orb/prefer-to-sorted` listed. This transform has no type information and a Set or an
// iterator has no `toSorted`, so the site list is the proof: it rewrites only the listed calls.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_SITES_FILE = "codemod-to-sorted-sites.json";

const SORT_CALL: RuleConfig<TS> = {
  rule: { kind: "call_expression", has: { field: "function", kind: "member_expression", has: { field: "property", regex: "^sort$" } } },
};

// An operand that is already a primary or member expression keeps its meaning in front of `.toSorted`.
const BARE_KINDS = new Set(["identifier", "member_expression", "subscript_expression", "call_expression", "parenthesized_expression", "this", "array"]);

export const getSelector: GetSelector<TS> = () => SORT_CALL;

function readSites(targetDir: string, sitesFile: string): ReadonlySet<string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, sitesFile), "utf8"));
  if (!Array.isArray(parsed) || parsed.some((site) => typeof site !== "string")) {
    throw new Error(`${sitesFile}: expected an array of "path:line:column" strings`);
  }
  return new Set(parsed);
}

const namedChildren = (node: SgNode<TS> | null): SgNode<TS>[] => node?.children().filter((child) => child.isNamed()) ?? [];

// The operand a receiver copies, when the receiver is one of the copy spellings.
function copiedOperand(receiver: SgNode<TS>): SgNode<TS> | null {
  if (receiver.kind() === "array") {
    const [only, ...rest] = namedChildren(receiver);
    return rest.length === 0 && only?.kind() === "spread_element" ? (namedChildren(only)[0] ?? null) : null;
  }
  const callee = receiver.kind() === "call_expression" ? receiver.field("function") : null;
  if (callee?.kind() !== "member_expression") {
    return null;
  }
  const name = callee.field("property")?.text();
  const args = namedChildren(receiver.field("arguments"));
  if (name === "slice" && args.length === 0) {
    return callee.field("object");
  }
  const [source, ...more] = args;
  return name === "from" && callee.field("object")?.text() === "Array" && more.length === 0 && source?.kind() !== "spread_element" ? (source ?? null) : null;
}

const codemod: Codemod<TS> = (root, options) => {
  const sites = readSites(options.targetDir, options.params["sites"] ?? DEFAULT_SITES_FILE);
  const file = root.relativeFilename();
  const edits: Edit[] = [];
  for (const call of root.root().findAll(SORT_CALL)) {
    const callee = call.field("function");
    const receiver = callee?.field("object") ?? null;
    const operand = receiver === null ? null : copiedOperand(receiver);
    const { line, column } = call.range().start;
    if (callee !== null && operand !== null && sites.has(`${file}:${line + 1}:${column + 1}`)) {
      const text = BARE_KINDS.has(operand.kind()) ? operand.text() : `(${operand.text()})`;
      edits.push(callee.replace(`${text}.toSorted`));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : root.root().commitEdits(edits));
};

export default codemod;
