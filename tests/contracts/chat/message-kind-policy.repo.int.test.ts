// @subject packages/contracts/src/chat/participants.ts
// MESSAGE_KIND_POLICY is the one home for per-kind row behavior, and an axis nobody reads is law with no
// enforcer (`comment: { prompt: "never" }` sat unenforced while assembly shipped comments to the wire). This
// reads the real record's axes and proves each one that can dispatch has a reader in packages/{server,client}/src.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MESSAGE_KIND_POLICY } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";

const HOME = "packages/contracts/src/chat/participants.ts";
const RECORD = "MESSAGE_KIND_POLICY";
const READER_ROOTS = ["packages/server/src", "packages/client/src"] as const;
// The barrels the record is imported through, plus the home file itself.
const RECORD_MODULES: readonly string[] = ["@orb/contracts/chat", "@orb/contracts"];
const isRecordModule = (specifier: string): boolean => RECORD_MODULES.includes(specifier) || specifier.endsWith("/participants.ts");

type PolicyRecord = Readonly<Record<string, object>>;

/** Axes whose value differs between kinds: an axis every kind answers identically has no dispatch to enforce. */
function dispatchingAxes(policy: PolicyRecord): readonly string[] {
  const cells = Object.values(policy).map((cell) => new Map(Object.entries(cell)));
  const axes = new Set(cells.flatMap((cell) => [...cell.keys()]));
  return [...axes].filter((axis) => new Set(cells.map((cell) => JSON.stringify(cell.get(axis)))).size > 1);
}

function isMemberAccess(node: Node | undefined, receiver: Node): boolean {
  return (
    (node?.isKind(SyntaxKind.PropertyAccessExpression) === true || node?.isKind(SyntaxKind.ElementAccessExpression) === true) &&
    node.getExpression() === receiver
  );
}

/** Every property name read above one record reference, across dotted and indexed spellings. */
function accessedNames(identifier: Node): readonly string[] {
  const names: string[] = [];
  let current: Node = identifier;
  for (let parent = current.getParent(); isMemberAccess(parent, current); parent = current.getParent()) {
    if (parent?.isKind(SyntaxKind.PropertyAccessExpression) === true) {
      names.push(parent.getName());
    }
    current = parent as Node;
  }
  return names;
}

/** The axes read through every reference to `local` in one file, the import specifier itself excluded. */
function axesReadThrough(source: Node, local: string): readonly string[] {
  return source
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === local && !identifier.getParent().isKind(SyntaxKind.ImportSpecifier))
    .flatMap(accessedNames);
}

/** Home-file exported consts that derive from the record, each with the axes it reads: a reader that imports one reads those axes. */
function carriersOf(home: SourceFile): ReadonlyMap<string, readonly string[]> {
  return new Map(
    home
      .getVariableDeclarations()
      .filter((declaration) => declaration.isExported() && declaration.getName() !== RECORD)
      .map((declaration) => [declaration.getName(), axesReadThrough(declaration.getVariableStatementOrThrow(), RECORD)] as const),
  );
}

function axesReadByFile(source: SourceFile, carriers: ReadonlyMap<string, readonly string[]>): readonly string[] {
  return source
    .getImportDeclarations()
    .filter((declaration) => isRecordModule(declaration.getModuleSpecifierValue()))
    .flatMap((declaration) => declaration.getNamedImports())
    .flatMap((specifier) => [
      ...(specifier.getName() === RECORD ? axesReadThrough(source, specifier.getAliasNode()?.getText() ?? RECORD) : []),
      ...(carriers.get(specifier.getName()) ?? []),
    ]);
}

/** Axes read off the record, in reader files directly or through an imported carrier. Parse-only. */
function readAxes(files: Readonly<Record<string, string>>): ReadonlySet<string> {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const home = files[HOME];
  const carriers = home === undefined ? new Map<string, readonly string[]>() : carriersOf(project.createSourceFile(HOME, home));
  return new Set(
    Object.entries(files)
      .filter(([path]) => READER_ROOTS.some((root) => path.startsWith(`${root}/`)))
      .flatMap(([path, text]) => axesReadByFile(project.createSourceFile(path, text), carriers)),
  );
}

function uncoveredAxes(policy: PolicyRecord, files: Readonly<Record<string, string>>): readonly string[] {
  const read = readAxes(files);
  return dispatchingAxes(policy).filter((axis) => !read.has(axis));
}

function sourceFilesUnder(root: string, relative: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(join(root, relative), { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name);
    if (!(entry.isFile() && /\.tsx?$/u.test(entry.name)) || path.includes("node_modules")) {
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (text.includes(RECORD) || text.includes("MEMORY_INGEST_KINDS")) {
      files[path.slice(root.length + 1)] = text;
    }
  }
  return files;
}

const TWO_KINDS = {
  standard: { memory: "ingest", prompt: "conversation", reading: "show" },
  comment: { memory: "exclude", prompt: "never", reading: "show" },
} as const;
const IMPORT_RECORD = 'import { MESSAGE_KIND_POLICY } from "@orb/contracts/chat";\n';

test("every dispatching axis of the real MESSAGE_KIND_POLICY has a production reader", ({ repoRoot }) => {
  expect(dispatchingAxes(MESSAGE_KIND_POLICY).length, "MESSAGE_KIND_POLICY resolved to zero dispatching axes").toBeGreaterThan(0);
  const files: Record<string, string> = { [HOME]: readFileSync(join(repoRoot, HOME), "utf8") };
  for (const root of READER_ROOTS) {
    Object.assign(files, sourceFilesUnder(repoRoot, root));
  }
  expect(uncoveredAxes(MESSAGE_KIND_POLICY, files)).toEqual([]);
});

test("an axis with no reader is uncovered, and an axis every kind answers alike owes none", () => {
  const server = "packages/server/src/domain/chat/assembly/shape.ts";
  expect(uncoveredAxes(TWO_KINDS, { [server]: `${IMPORT_RECORD}export const p = MESSAGE_KIND_POLICY.standard.prompt;\n` })).toEqual(["memory"]);
  expect(uncoveredAxes(TWO_KINDS, {})).toEqual(["memory", "prompt"]);
});

test("a local object that only shares the record's name is not a reader", () => {
  expect(
    uncoveredAxes(TWO_KINDS, {
      "packages/server/src/domain/chat/assembly/shape.ts":
        "const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation' } };\nexport const p = MESSAGE_KIND_POLICY.standard.prompt;\n",
    }),
  ).toEqual(["memory", "prompt"]);
});

test("a contracts-internal read is a derivation, not a behavior-tier reader", () => {
  expect(
    uncoveredAxes(TWO_KINDS, {
      "packages/contracts/src/chat/derive.ts":
        'import { MESSAGE_KIND_POLICY } from "./participants.ts";\nexport const m = MESSAGE_KIND_POLICY.standard.memory;\n',
    }),
  ).toEqual(["memory", "prompt"]);
});

test("an aliased import and an imported home-file carrier both count as readers", () => {
  const aliased =
    'import { MESSAGE_KIND_POLICY as POLICY } from "@orb/contracts/chat";\nexport const m = POLICY.standard.memory;\nexport const p = POLICY.standard.prompt;\n';
  expect(uncoveredAxes(TWO_KINDS, { "packages/client/src/features/chat/lib/read.ts": aliased })).toEqual([]);
  const carrier = {
    [HOME]: "export const MEMORY_INGEST_KINDS = ['standard'].filter(() => MESSAGE_KIND_POLICY.standard.memory === 'ingest');\n",
    "packages/server/src/domain/chat/memory/persistence/queries.ts":
      'import { MEMORY_INGEST_KINDS } from "@orb/contracts/chat";\nexport const k = MEMORY_INGEST_KINDS;\n',
    "packages/server/src/domain/chat/assembly/shape.ts": `${IMPORT_RECORD}export const p = MESSAGE_KIND_POLICY.standard.prompt;\n`,
  };
  expect(uncoveredAxes(TWO_KINDS, carrier)).toEqual([]);
  // A home-file derivation nobody imports enforces nothing, and one beside a real read changes no verdict.
  const unimported = {
    [HOME]: carrier[HOME],
    "packages/server/src/domain/chat/assembly/shape.ts": carrier["packages/server/src/domain/chat/assembly/shape.ts"],
  };
  expect(uncoveredAxes(TWO_KINDS, unimported)).toEqual(["memory"]);
  const self = { ...carrier, [HOME]: `${carrier[HOME]}export const SELF = MESSAGE_KIND_POLICY.standard.memory;\n` };
  expect(uncoveredAxes(TWO_KINDS, self)).toEqual([]);
});
