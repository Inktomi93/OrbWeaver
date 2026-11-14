// Repoints module specifiers and path cites for a set of file moves: every importer of a moved file, every specifier
// inside a moved file, and every comment that cites a moved file or sits in one is rewritten for the post-move tree.
// Run it before the `git mv`, while each path still names its file.
//
// A specifier is a static, re-export or dynamic import, or the module name a Vitest mock call takes. An alias
// specifier resolves through the `imports` map of the nearest `package.json`, as Node resolves it, so the package's own
// `#src/` and `#<module>` aliases and the root `#<package>/` aliases all follow a move. A comment cite is a rooted path
// or a `./` or `../` path; a bare file name survives a move unchanged.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// The plan lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_PLAN_FILE = "codemod-module-moves.json";
// `#src/<path>` names a file inside the importer's own package source (Core-0 §1, principle 2).
const SRC_ALIAS = "#src/";
const PACKAGE_SRC = /^(packages\/[^/]+\/src)\//u;
const PACKAGE_MANIFEST = "package.json";
// The Vitest calls whose first argument names a module.
const MOCK_CALLS = "^(?:mock|doMock|unmock|doUnmock|importActual|importMock)$";
// A path cite in comment text: a rooted path and a relative one, each bounded by characters no path holds. A trailing
// full stop ends the sentence, not the path. A quoted path is an example and cites nothing (`.claude/rules/comments.md`).
const PATH_CHAR = String.raw`[\w@./-]`;
const CITE_START = String.raw`(?<![\w@./*"'-])`;
const RELATIVE_CITE = new RegExp(String.raw`${CITE_START}\.\.?/${PATH_CHAR}*[\w@-]`, "gu");

const MODULE_SPECIFIER: RuleConfig<TS> = {
  rule: {
    any: [
      {
        kind: "string",
        any: [
          { inside: { kind: "import_statement" } },
          { inside: { kind: "export_statement" } },
          { inside: { kind: "arguments", inside: { kind: "call_expression", has: { field: "function", kind: "import" } } } },
          {
            inside: {
              kind: "arguments",
              inside: {
                kind: "call_expression",
                has: {
                  field: "function",
                  kind: "member_expression",
                  all: [
                    { has: { field: "object", kind: "identifier", regex: "^vi$" } },
                    { has: { field: "property", kind: "property_identifier", regex: MOCK_CALLS } },
                  ],
                },
              },
            },
          },
        ],
      },
      { kind: "comment" },
    ],
  },
};

/** Every static, dynamic or mocked module specifier and every comment; the plan decides which ones change. */
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

// A file's module spelling relative to `moved`. Inside one package's source a relative import climbs at most one
// directory (`package-parent-climb`); a deeper target is spelled through the package's own alias instead.
function spellRelative(moved: string, next: string): string {
  const spelled = relativeSpecifier(dirOf(moved), next);
  const movedSrc = PACKAGE_SRC.exec(moved)?.[1];
  const deepInSrc = spelled.startsWith("../../") && movedSrc !== undefined && next.startsWith(`${movedSrc}/`);
  return deepInSrc ? `${SRC_ALIAS}${next.slice(movedSrc.length + 1)}` : spelled;
}

/** One `imports` entry: the alias pattern and the target-relative path pattern it maps to, each split at its `*`. */
interface AliasEntry {
  readonly key: string;
  readonly keyHead: string;
  readonly keyTail: string | null;
  readonly pathHead: string;
  readonly pathTail: string;
}

/** The `imports` map of the nearest `package.json` above a path. */
interface Scope {
  readonly dir: string;
  readonly entries: readonly AliasEntry[];
}

function entriesOf(dir: string, manifest: unknown): readonly AliasEntry[] {
  const imports = manifest !== null && typeof manifest === "object" ? (manifest as Record<string, unknown>)["imports"] : undefined;
  if (imports === null || typeof imports !== "object") {
    return [];
  }
  const entries = Object.entries(imports).flatMap(([key, value]): AliasEntry[] => {
    if (typeof value !== "string") {
      return [];
    }
    const path = resolvePath(dir, value);
    const [keyHead = key, keyTail = null] = key.split("*");
    const [pathHead = path, pathTail = ""] = path.split("*");
    return [{ key, keyHead, keyTail, pathHead, pathTail }];
  });
  // Node takes the pattern with the longest text before its `*`, so `#src/x` resolves through `#src/*`, never `#*`.
  return entries.toSorted((left, right) => right.keyHead.length - left.keyHead.length);
}

const listing = (targetDir: string, dir: string): readonly string[] => readdirSync(join(targetDir, dir === "" ? "." : dir));

// The target root and each directory below it on the way to `dir` that exists: a moved file's new directory may not
// exist yet, and it then takes its nearest existing ancestor's scope.
function existingAncestors(targetDir: string, dir: string): readonly string[] {
  const parts = dir.split("/").filter((part) => part !== "");
  const found = [""];
  for (const [index, part] of parts.entries()) {
    if (!listing(targetDir, parts.slice(0, index).join("/")).includes(part)) {
      break;
    }
    found.push(parts.slice(0, index + 1).join("/"));
  }
  return found;
}

function scopeOf(targetDir: string, path: string, scopes: Map<string, Scope | null>): Scope | null {
  const cached = scopes.get(dirOf(path));
  if (cached !== undefined) {
    return cached;
  }
  let scope: Scope | null = null;
  for (const dir of existingAncestors(targetDir, dirOf(path))) {
    if (listing(targetDir, dir).includes(PACKAGE_MANIFEST)) {
      scope = { dir, entries: entriesOf(dir, JSON.parse(readFileSync(join(targetDir, dir, PACKAGE_MANIFEST), "utf8"))) };
    }
  }
  scopes.set(dirOf(path), scope);
  return scope;
}

// The text a `*` stands for when `text` fits the pattern `head*tail`; Node requires it to be non-empty.
function starOf(text: string, head: string, tail: string): string | null {
  const fits = text.length > head.length + tail.length && text.startsWith(head) && text.endsWith(tail);
  return fits ? text.slice(head.length, text.length - tail.length) : null;
}

function resolveAlias(scope: Scope, specifier: string): { readonly entry: AliasEntry; readonly path: string } | null {
  for (const entry of scope.entries) {
    if (entry.keyTail === null) {
      if (specifier === entry.key) {
        return { entry, path: entry.pathHead };
      }
      continue;
    }
    const star = starOf(specifier, entry.keyHead, entry.keyTail);
    if (star !== null) {
      return { entry, path: `${entry.pathHead}${star}${entry.pathTail}` };
    }
  }
  return null;
}

function spellThrough(entry: AliasEntry, path: string): string | null {
  if (entry.keyTail === null) {
    return path === entry.pathHead ? entry.key : null;
  }
  const star = starOf(path, entry.pathHead, entry.pathTail);
  return star === null ? null : `${entry.keyHead}${star}${entry.keyTail}`;
}

// The alias spelling of `path` in `scope`, the importer's own pattern first, accepted only when it resolves back to
// `path` so a longer pattern cannot capture it.
function aliasFor(scope: Scope, path: string, preferred: AliasEntry): string | null {
  for (const entry of [preferred, ...scope.entries.filter((other) => other !== preferred)]) {
    const spelled = spellThrough(entry, path);
    if (spelled !== null && resolveAlias(scope, spelled)?.path === path) {
      return spelled;
    }
  }
  return null;
}

interface MoveContext {
  readonly targetDir: string;
  readonly plan: ReadonlyMap<string, string>;
  readonly importer: string;
  readonly moved: string;
  readonly scopes: Map<string, Scope | null>;
}

// An alias specifier keeps its alias while the scope the moved importer lands in can spell the target; otherwise it
// becomes relative. A bare package name resolves through no alias and stays.
function respellAlias(specifier: string, context: MoveContext): string | null {
  const scope = scopeOf(context.targetDir, context.importer, context.scopes);
  if (scope === null) {
    return null;
  }
  const resolved = resolveAlias(scope, specifier);
  if (resolved === null) {
    return null;
  }
  const next = context.plan.get(resolved.path) ?? resolved.path;
  const movedScope = scopeOf(context.targetDir, context.moved, context.scopes);
  if (movedScope === null) {
    return spellRelative(context.moved, next);
  }
  if (next === resolved.path && movedScope.dir === scope.dir) {
    return null;
  }
  return aliasFor(movedScope, next, resolved.entry) ?? spellRelative(context.moved, next);
}

// The new spelling of one specifier, or null when neither the importer nor the file it names moves.
function respell(specifier: string, context: MoveContext): string | null {
  const { plan, importer, moved } = context;
  if (!specifier.startsWith(".")) {
    const final = respellAlias(specifier, context);
    return final === specifier ? null : final;
  }
  const target = resolvePath(dirOf(importer), specifier);
  const next = plan.get(target) ?? target;
  if (next === target && moved === importer) {
    return null;
  }
  const final = spellRelative(moved, next);
  return final === specifier ? null : final;
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`);
}

// A comment with each cite of a moved file, and each relative cite from a moved file, spelled for the post-move tree.
function recite(text: string, context: MoveContext): string {
  const { plan, importer, moved } = context;
  const relative = text.replaceAll(RELATIVE_CITE, (cite) => {
    const target = resolvePath(dirOf(importer), cite);
    const next = plan.get(target) ?? target;
    return next === target && moved === importer ? cite : relativeSpecifier(dirOf(moved), next);
  });
  // A rooted cite never follows a path character, so a relative cite above cannot contain one.
  let rooted = relative;
  for (const [from, to] of plan) {
    rooted = rooted.replaceAll(new RegExp(String.raw`${CITE_START}${escapeRegExp(from)}(?![\w@/-]|\.[\w@-])`, "gu"), to);
  }
  return rooted;
}

function editOf(node: SgNode<TS>, context: MoveContext): Edit | null {
  const text = node.text();
  if (node.kind() === "comment") {
    const next = recite(text, context);
    return next === text ? null : node.replace(next);
  }
  const quote = text[0] ?? '"';
  const next = respell(text.slice(1, -1), context);
  return next === null ? null : node.replace(`${quote}${next}${quote}`);
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["plan"] ?? DEFAULT_PLAN_FILE);
  const importer = root.relativeFilename();
  const context: MoveContext = { targetDir: options.targetDir, plan, importer, moved: plan.get(importer) ?? importer, scopes: new Map() };
  const rootNode = root.root();
  const nodes = options.matches ?? rootNode.findAll(MODULE_SPECIFIER);
  const edits = nodes.flatMap((node) => editOf(node, context) ?? []);
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
