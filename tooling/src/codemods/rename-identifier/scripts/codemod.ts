// Renames one declared identifier and every reference that resolves to it, by binding, never by text.
// The declaring file performs every edit through `references()` and `root.write()`, so no file order matters.
// `jssg test` resolves within one file; `tests-crossfile/` holds the multi-file case for the skill's `jssg run` step.

import type { Codemod, Edit, SgNode, SgRoot } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The config lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_CONFIG_FILE = "codemod-rename.json";

interface RenameConfig {
  /** Path of the declaring file, relative to the target directory. */
  readonly file: string;
  readonly from: string;
  readonly to: string;
}

const DECLARATION_PARENTS = [
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "abstract_class_declaration",
  "variable_declarator",
  "type_alias_declaration",
  "interface_declaration",
] as const;

const SHORTHAND_KINDS = new Set(["shorthand_property_identifier", "shorthand_property_identifier_pattern"]);

function readConfig(targetDir: string, params: Record<string, string> | undefined): RenameConfig {
  const file = params?.["file"];
  const from = params?.["from"];
  const to = params?.["to"];
  if (file !== undefined && from !== undefined && to !== undefined) {
    return { file, from, to };
  }
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, params?.["config"] ?? DEFAULT_CONFIG_FILE), "utf8"));
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("rename config: expected an object with file, from and to");
  }
  const candidate = parsed as Partial<Record<keyof RenameConfig, unknown>>;
  if (typeof candidate.file !== "string" || typeof candidate.from !== "string" || typeof candidate.to !== "string") {
    throw new Error("rename config: file, from and to must be strings");
  }
  return { file: candidate.file, from: candidate.from, to: candidate.to };
}

/** The identifier that declares `name` at module level, or null when this file declares no such symbol. */
function findDeclaration(rootNode: SgNode<TS>, name: string): SgNode<TS> | null {
  return rootNode.find({
    rule: {
      any: [{ kind: "identifier" }, { kind: "type_identifier" }],
      regex: `^${name}$`,
      inside: { any: DECLARATION_PARENTS.map((kind) => ({ kind })) },
    },
  });
}

/** `{ from }` means key `from`, value `from`; the key must survive the rename. */
function renameEdit(node: SgNode<TS>, config: RenameConfig): Edit {
  return node.replace(SHORTHAND_KINDS.has(node.kind()) ? `${config.from}: ${config.to}` : config.to);
}

function editsFor(nodes: readonly SgNode<TS>[], config: RenameConfig): Edit[] {
  return nodes.filter((node) => node.text() === config.from).map((node) => renameEdit(node, config));
}

const codemod: Codemod<TS> = (root, options) => {
  const config = readConfig(options.targetDir, options.params);
  const declaringFile = join(options.targetDir, config.file);
  if (root.filename() !== declaringFile && !root.filename().endsWith(`/${config.file}`)) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const declaration = findDeclaration(rootNode, config.from);
  if (declaration === null) {
    return Promise.resolve(null);
  }
  const ownEdits: Edit[] = [renameEdit(declaration, config)];
  for (const { root: fileRoot, nodes } of declaration.references()) {
    const other: SgRoot<TS> = fileRoot;
    if (other.filename() === root.filename()) {
      ownEdits.push(
        ...editsFor(
          nodes.filter((node) => node.range().start.index !== declaration.range().start.index),
          config,
        ),
      );
      continue;
    }
    const edits = editsFor(nodes, config);
    if (edits.length > 0) {
      other.write(other.root().commitEdits(edits));
    }
  }
  return Promise.resolve(rootNode.commitEdits(ownEdits));
};

export default codemod;
