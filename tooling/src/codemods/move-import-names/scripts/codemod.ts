// Moves named imports from one module to another in the listed files, renaming each moved binding and its references.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The plan lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_PLAN_FILE = "codemod-import-moves.json";

interface ImportMove {
  readonly from: string;
  readonly to: string;
  /** Imported name to its name in `to`; an equal pair moves the name without renaming it. */
  readonly names: Readonly<Record<string, string>>;
  /** Paths relative to the target directory; the move is a decision per file, never a sweep. */
  readonly files: readonly string[];
}

const IMPORT_STATEMENT: RuleConfig<TS> = { rule: { kind: "import_statement" } };

/** Every import statement; the plan decides which files and modules change. */
export const getSelector: GetSelector<TS> = () => IMPORT_STATEMENT;

function readPlan(targetDir: string, planFile: string): readonly ImportMove[] {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, planFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || !("moves" in parsed) || !Array.isArray(parsed.moves)) {
    throw new Error(`${planFile}: expected { "moves": [...] }`);
  }
  return parsed.moves.map((move: unknown, index: number): ImportMove => {
    if (
      move === null ||
      typeof move !== "object" ||
      !("from" in move && typeof move.from === "string") ||
      !("to" in move && typeof move.to === "string") ||
      !("names" in move && move.names !== null && typeof move.names === "object") ||
      !("files" in move && Array.isArray(move.files))
    ) {
      throw new Error(`${planFile}: move ${index} needs from, to, names and files`);
    }
    const names: Record<string, string> = {};
    for (const [name, renamed] of Object.entries(move.names)) {
      if (typeof renamed !== "string") {
        throw new Error(`${planFile}: move ${index} maps ${name} to a non-string`);
      }
      names[name] = renamed;
    }
    const files = move.files.map((file: unknown) => {
      if (typeof file !== "string") {
        throw new Error(`${planFile}: move ${index} lists a non-string file`);
      }
      return file;
    });
    return { from: move.from, to: move.to, names, files };
  });
}

function sourceOf(statement: SgNode<TS>): string | undefined {
  return statement
    .field("source")
    ?.find({ rule: { kind: "string_fragment" } })
    ?.text();
}

const isTypeOnly = (statement: SgNode<TS>): boolean => statement.children().some((child) => child.kind() === "type");

function specifiersOf(statement: SgNode<TS>): readonly SgNode<TS>[] {
  return statement.find({ rule: { kind: "named_imports" } })?.findAll({ rule: { kind: "import_specifier" } }) ?? [];
}

// `name` or `name as alias`, with the imported name swapped.
function respell(specifier: SgNode<TS>, renamed: string): string {
  const alias = specifier.field("alias");
  return alias === null ? renamed : `${renamed} as ${alias.text()}`;
}

function statementText(typeOnly: boolean, specifiers: readonly string[], module: string): string {
  return `import ${typeOnly ? "type " : ""}{ ${specifiers.join(", ")} } from "${module}";`;
}

const NEWLINE = 0x0a;

// Deleting a whole statement also takes its line break, so no blank line is left between imports.
function deleteStatement(statement: SgNode<TS>, bytes: Uint8Array): Edit {
  const { start, end } = statement.range();
  const newline = bytes[end.index] === NEWLINE ? 1 : 0;
  return { startPos: start.index, endPos: end.index + newline, insertedText: "" };
}

interface DoorSplit {
  readonly door: SgNode<TS>;
  readonly kept: readonly string[];
  readonly moved: readonly string[];
}

// Splits one door statement's specifiers into those that stay and those that move, recording binding renames.
function splitDoor(door: SgNode<TS>, move: ImportMove, renames: Map<string, string>): DoorSplit {
  const kept: string[] = [];
  const moved: string[] = [];
  for (const specifier of specifiersOf(door)) {
    const imported = specifier.field("name")?.text() ?? "";
    const renamed = move.names[imported];
    if (renamed === undefined) {
      kept.push(specifier.text());
      continue;
    }
    moved.push(respell(specifier, renamed));
    if (specifier.field("alias") === null && renamed !== imported) {
      renames.set(imported, renamed);
    }
  }
  return { door, kept, moved };
}

interface MoveContext {
  readonly statements: readonly SgNode<TS>[];
  readonly bytes: Uint8Array;
  readonly renames: Map<string, string>;
}

// One move for one import kind: the moved names join an existing `to` import, or a new one after the last door they left.
function moveKind(move: ImportMove, typeOnly: boolean, context: MoveContext): readonly Edit[] {
  const splits = context.statements
    .filter((statement) => sourceOf(statement) === move.from && isTypeOnly(statement) === typeOnly)
    .map((door) => splitDoor(door, move, context.renames))
    .filter((split) => split.moved.length > 0);
  const last = splits.at(-1);
  if (last === undefined) {
    return [];
  }
  const moved = splits.flatMap((split) => split.moved);
  const edits: Edit[] = [];
  const existing = context.statements.find((statement) => sourceOf(statement) === move.to && isTypeOnly(statement) === typeOnly);
  if (existing !== undefined) {
    const merged = new Set([...specifiersOf(existing).map((specifier) => specifier.text()), ...moved]);
    edits.push(existing.replace(statementText(typeOnly, [...merged], move.to)));
  }
  for (const split of splits) {
    const insert = existing === undefined && split === last ? statementText(typeOnly, moved, move.to) : undefined;
    const lines = [split.kept.length === 0 ? undefined : statementText(typeOnly, split.kept, move.from), insert].filter((line) => line !== undefined);
    edits.push(lines.length === 0 ? deleteStatement(split.door, context.bytes) : split.door.replace(lines.join("\n")));
  }
  return edits;
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["plan"] ?? DEFAULT_PLAN_FILE);
  const file = root.relativeFilename();
  const moves = plan.filter((move) => move.files.includes(file));
  if (moves.length === 0) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const context: MoveContext = { statements: rootNode.findAll(IMPORT_STATEMENT), bytes: new TextEncoder().encode(rootNode.text()), renames: new Map() };
  const edits = moves.flatMap((move) => [true, false].flatMap((typeOnly) => moveKind(move, typeOnly, context)));
  for (const [name, renamed] of context.renames) {
    // Value bindings are `identifier`s and type bindings `type_identifier`s; keys, members and strings are other kinds.
    const references = rootNode.findAll({
      rule: { any: [{ kind: "identifier" }, { kind: "type_identifier" }], regex: `^${name}$`, not: { inside: { kind: "import_statement", stopBy: "end" } } },
    });
    edits.push(...references.map((reference) => reference.replace(renamed)));
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
