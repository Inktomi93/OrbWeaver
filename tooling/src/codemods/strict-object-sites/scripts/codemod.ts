// Rewrites `z.object(` to `z.strictObject(` at exactly the call sites a JSON list in the target directory names.
// A site is `<path relative to the target>:<1-based line of the "object" property>:<0-based ordinal of the
// z.object calls on that line>`, so a list from a runtime schema survey selects input schemas and nothing else.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The list lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_SITES_FILE = "codemod-strict-object-sites.json";

const OBJECT_CALL: RuleConfig<TS> = { rule: { kind: "call_expression", pattern: "z.object($$$)" } };

/** Every `z.object` call; the site list decides which ones change. */
export const getSelector: GetSelector<TS> = () => OBJECT_CALL;

function isSiteList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((site) => typeof site === "string");
}

function readSites(targetDir: string, sitesFile: string): ReadonlySet<string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, sitesFile), "utf8"));
  if (isSiteList(parsed)) {
    return new Set(parsed);
  }
  throw new Error(`${sitesFile}: expected an array of "<path>:<line>:<ordinal>" strings`);
}

const codemod: Codemod<TS> = (root, options) => {
  const sites = readSites(options.targetDir, options.params["sites"] ?? DEFAULT_SITES_FILE);
  const rootNode = root.root();
  const calls: readonly SgNode<TS>[] = options.matches ?? rootNode.findAll(OBJECT_CALL);
  const properties = calls.flatMap((call) => call.field("function")?.field("property") ?? []);
  const file = root.relativeFilename();
  const perLine = new Map<number, number>();
  const edits: Edit[] = [];
  for (const property of [...properties].sort((a, b) => a.range().start.index - b.range().start.index)) {
    const line = property.range().start.line + 1;
    const ordinal = perLine.get(line) ?? 0;
    perLine.set(line, ordinal + 1);
    if (sites.has(`${file}:${line}:${ordinal}`)) {
      edits.push(property.replace("strictObject"));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
