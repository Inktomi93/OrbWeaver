// Repoints module specifiers for a set of file moves: every importer of a moved file, and every relative import inside
// a moved file, is rewritten for the post-move tree. Run it before the `git mv`, while each path still names its file.

import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The plan lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_PLAN_FILE = "codemod-module-moves.json";
// `#src/<path>` names a file inside the importer's own package source (Core-0 §1, principle 2).
const SRC_ALIAS = "#src/";
const PACKAGE_SRC = /^(packages\/[^/]+\/src)\//u;

const MODULE_SPECIFIER: RuleConfig<TS> = {
  rule: {
    kind: "string",
    any: [
      { inside: { kind: "import_statement" } },
      { inside: { kind: "export_statement" } },
      { inside: { kind: "arguments", inside: { kind: "call_expression", has: { field: "function", kind: "import" } } } },
    ],
  },
};

/** Every static or dynamic module specifier; the plan decides which ones change. */
export const getSelector: GetSelector<TS> = () => MODULE_SPECIFIER;

function readPlan(targetDir: string, planFile: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, planFile), "utf8"));
  const moves = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)["moves"] : undefined;
  if (moves === null || typeof moves !== "object" || Array.isArray(moves)) {
    throw new Error(`${planFile}: expected { "moves": { "old/path.ts": "new/path.ts" } }`);
  }
  return new Map(
    Object.entries(moves).map(([from, to]) => {
      if (typeof to !== "string") {
        throw new Error(`${planFile}: moves.${from} maps to a non-string`);
      }
      return [from, to] as const;
    }),
  );
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

// POSIX join and normalize over target-relative paths; a climb above the target root keeps its `..` segments.
function resolvePath(dir: string, relative: string): string {
  const parts: string[] = [];
  for (const segment of [...dir.split("/"), ...relative.split("/")]) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === ".." && parts.length > 0 && parts.at(-1) !== "..") {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

function relativeSpecifier(fromDir: string, to: string): string {
  const from = fromDir === "" ? [] : fromDir.split("/");
  const target = to.split("/");
  let shared = 0;
  while (shared < from.length && shared < target.length - 1 && from[shared] === target[shared]) {
    shared += 1;
  }
  const climb = from.slice(shared).map(() => "..");
  const path = [...climb, ...target.slice(shared)].join("/");
  return climb.length === 0 ? `./${path}` : path;
}

// The new spelling of one specifier, or null when neither the importer nor the imported file moves.
function respell(specifier: string, importer: string, moved: string, plan: ReadonlyMap<string, string>): string | null {
  if (specifier.startsWith(".")) {
    const target = resolvePath(dirOf(importer), specifier);
    const next = plan.get(target) ?? target;
    if (next === target && moved === importer) {
      return null;
    }
    const spelled = relativeSpecifier(dirOf(moved), next);
    return spelled === specifier ? null : spelled;
  }
  const src = PACKAGE_SRC.exec(importer)?.[1];
  if (specifier.startsWith(SRC_ALIAS) && src !== undefined) {
    const next = plan.get(`${src}/${specifier.slice(SRC_ALIAS.length)}`);
    return next?.startsWith(`${src}/`) === true ? `${SRC_ALIAS}${next.slice(src.length + 1)}` : null;
  }
  return null;
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["plan"] ?? DEFAULT_PLAN_FILE);
  const importer = root.relativeFilename();
  const moved = plan.get(importer) ?? importer;
  const rootNode = root.root();
  const specifiers = options.matches ?? rootNode.findAll(MODULE_SPECIFIER);
  const edits: Edit[] = [];
  for (const specifier of specifiers) {
    const text = specifier.text();
    const quote = text[0] ?? '"';
    const next = respell(text.slice(1, -1), importer, moved, plan);
    if (next !== null) {
      edits.push(specifier.replace(`${quote}${next}${quote}`));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
