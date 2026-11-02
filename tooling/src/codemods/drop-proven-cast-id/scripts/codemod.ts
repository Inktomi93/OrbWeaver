// Drops `castId<T>(x)` to `x` at the sites `orb/no-unsafe-cast` proved redundant: the argument already carries the brand.
// The site list is the proof: this transform has no type information, so it rewrites only the listed lines.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_SITES_FILE = "codemod-cast-id-sites.json";
const CAST_ID = "castId";
const NEWLINE_BYTE = 0x0a;

const CAST_ID_CALL: RuleConfig<TS> = {
  rule: { kind: "call_expression", has: { field: "function", kind: "identifier", regex: `^${CAST_ID}$` } },
};

const CAST_ID_SPECIFIER: RuleConfig<TS> = {
  rule: { kind: "import_specifier", has: { kind: "identifier", regex: `^${CAST_ID}$` }, inside: { kind: "import_statement", stopBy: "end" } },
};

// An argument that is already a primary or member expression keeps its meaning without the call's parentheses.
const BARE_KINDS = new Set(["identifier", "member_expression", "subscript_expression", "call_expression", "parenthesized_expression"]);

export const getSelector: GetSelector<TS> = () => CAST_ID_CALL;

function readSites(targetDir: string, sitesFile: string): ReadonlySet<string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, sitesFile), "utf8"));
  if (!Array.isArray(parsed) || parsed.some((site) => typeof site !== "string")) {
    throw new Error(`${sitesFile}: expected an array of "path:line" strings`);
  }
  return new Set(parsed);
}

function argumentOf(call: SgNode<TS>): SgNode<TS> | null {
  const args =
    call
      .field("arguments")
      ?.children()
      .filter((child) => child.isNamed()) ?? [];
  return args.length === 1 ? (args[0] ?? null) : null;
}

// Remove the `castId` specifier once no call is left; the whole import goes when it named nothing else.
function importEdit(rootNode: SgNode<TS>): Edit | null {
  const specifier = rootNode.find(CAST_ID_SPECIFIER);
  const statement = specifier?.ancestors().find((node) => node.kind() === "import_statement");
  if (specifier === null || statement === undefined) {
    return null;
  }
  const siblings = statement.findAll({ rule: { kind: "import_specifier" } });
  if (siblings.length === 1) {
    const bytes = new TextEncoder().encode(rootNode.text());
    const { start, end } = statement.range();
    return { startPos: start.index, endPos: bytes[end.index] === NEWLINE_BYTE ? end.index + 1 : end.index, insertedText: "" };
  }
  const next = specifier.next();
  const { start } = specifier.range();
  // `castId, other` drops through the comma and its space; a trailing `other, castId` drops the comma before it.
  if (next?.text() === ",") {
    const after = next.next();
    return { startPos: start.index, endPos: after?.range().start.index ?? next.range().end.index, insertedText: "" };
  }
  const previous = specifier.prev();
  return { startPos: previous?.range().start.index ?? start.index, endPos: specifier.range().end.index, insertedText: "" };
}

const codemod: Codemod<TS> = (root, options) => {
  const sites = readSites(options.targetDir, options.params["sites"] ?? DEFAULT_SITES_FILE);
  const file = root.relativeFilename();
  const rootNode = root.root();
  const calls = rootNode.findAll(CAST_ID_CALL);
  const edits: Edit[] = [];
  for (const call of calls) {
    const argument = argumentOf(call);
    if (argument !== null && sites.has(`${file}:${call.range().start.line + 1}`)) {
      edits.push(call.replace(BARE_KINDS.has(argument.kind()) ? argument.text() : `(${argument.text()})`));
    }
  }
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  const removal = edits.length === calls.length ? importEdit(rootNode) : null;
  return Promise.resolve(rootNode.commitEdits(removal === null ? edits : [...edits, removal]));
};

export default codemod;
