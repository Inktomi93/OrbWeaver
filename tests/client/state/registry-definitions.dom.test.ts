import { globSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HomeTileContribution, SectionDefinition } from "@orb/client/state";
import { assembleChrome, CONFIG_GROUP_IDS, HOME_TILE_IDS, isCollectionGroup, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { createAuthedComposition, createClientRuntime } from "@orb/testkit/browser";
import { expect, test } from "@orb/testkit/node";
import ts from "typescript";
import { chromeWidgets } from "#client/compose/contributors.ts";
import { homeTiles } from "#client/compose/home-tiles.ts";

const FEATURES = fileURLToPath(new URL("../../../packages/client/src/features", import.meta.url));

// The production door, assembled exactly as the lazy authenticated route assembles it.
const composition = createAuthedComposition(createClientRuntime("http://localhost"));

const blank = (text: string): boolean => text.trim().length === 0;

/** A dormant doorway owes its reader a reason and a teaser; a live body owes neither. */
function dormantFaults(body: HomeTileContribution["body"]): readonly string[] {
  if (typeof body === "function") {
    return [];
  }
  const { reason, teaser } = body.dormant;
  return [...(blank(reason) ? ["empty reason"] : []), ...(blank(teaser) ? ["empty teaser"] : [])];
}

/** A planned section owes a stated reason; a live section has none to state. */
function plannedFaults(content: SectionDefinition["content"]): readonly string[] {
  return typeof content === "function" || !blank(content.planned) ? [] : ["empty planned reason"];
}

test("every section definition sits under its own id and states any planned reason", () => {
  for (const id of SECTION_IDS) {
    expect(composition.sections.get(id).id).toBe(id);
  }
  expect(composition.sections.list().flatMap(({ content }) => plannedFaults(content))).toEqual([]);
});

test("a planned section that states nothing is refused by the judge", () => {
  expect(plannedFaults({ planned: " " })).toEqual(["empty planned reason"]);
  expect(plannedFaults({ planned: "Build pending." })).toEqual([]);
});

test("every config group sits under its own id", () => {
  for (const id of CONFIG_GROUP_IDS) {
    expect(composition.configGroups.get(id).id).toBe(id);
  }
});

test("a collection group declares its lifecycle as named data", () => {
  const collections = CONFIG_GROUP_IDS.map((id) => composition.configGroups.get(id)).filter(isCollectionGroup);
  expect(collections.length).toBeGreaterThan(0);
  const blanks = collections.flatMap(({ id, body: { collection } }) => [
    ...(blank(collection.create.label) ? [`${id} create.label`] : []),
    ...(collection.importFile !== undefined && blank(collection.importFile.label) ? [`${id} importFile.label`] : []),
    ...(collection.importFile !== undefined && blank(collection.importFile.accept) ? [`${id} importFile.accept`] : []),
  ]);
  expect(blanks).toEqual([]);
});

test("every collection body file is registered by a group", async () => {
  const registered = new Set<unknown>(
    CONFIG_GROUP_IDS.map((id) => composition.configGroups.get(id)).flatMap((group) => (isCollectionGroup(group) ? [group.body.collection] : [])),
  );
  const files = [...globSync("*/lib/*-collection.ts", { cwd: FEATURES }), ...globSync("*/lib/*-collection.tsx", { cwd: FEATURES })];
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const exported: Record<string, unknown> = await import(/* @vite-ignore */ `${FEATURES}/${file}`);
    expect(
      Object.values(exported).some((value) => registered.has(value)),
      `${file} is exported but no group's body.collection is it`,
    ).toBe(true);
  }
});

test("home tiles keep unique ids and an honest dormant doorway", () => {
  const ids = homeTiles.list().map((tile) => tile.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual([...HOME_TILE_IDS]);
  expect(homeTiles.list().flatMap((tile) => dormantFaults(tile.body))).toEqual([]);
});

test("a dormant doorway that names nothing or promises nothing is refused by the judge", () => {
  expect(dormantFaults({ dormant: { reason: "", teaser: "Soon, with a subject." } })).toEqual(["empty reason"]);
  expect(dormantFaults({ dormant: { reason: "Not built.", teaser: "  " } })).toEqual(["empty teaser"]);
  expect(dormantFaults({ dormant: { reason: "Not built.", teaser: "Soon, with a subject." } })).toEqual([]);
});

test("chrome entries from the whole door carry unique ids", () => {
  const ids = composition.chrome.list().map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("assembling chrome refuses a repeated id and a zone outside CHROME_ZONES", () => {
  const [widget] = chromeWidgets;
  expect(widget).toBeDefined();
  if (widget === undefined) {
    return;
  }
  expect(() => assembleChrome({ sections: [], modals: [], widgets: [widget, widget] })).toThrow(`duplicate chrome entry id "${widget.id}"`);
  // The type admits only CHROME_ZONES; the door re-judges the value, so a widened zone still renders nowhere unseen.
  const stray = { ...widget };
  Reflect.set(stray, "zone", "sidebar.top");
  expect(() => assembleChrome({ sections: [], modals: [], widgets: [stray] })).toThrow('declares zone "sidebar.top"');
});

// A co-located definition the door never wires is invisible to every test above, so its duplicate id or empty
// copy would rot unseen. Discover the declarations by annotation, then demand the door holds each one, and demand
// every feature directory to own at least one such held definition: a definition-shaped filename is not evidence.
//
// Recognition limits. A declaration is recognized only when it is annotated with the definition type by name:
// `export const x: T = …`, `export function f(): T`, `export const f = (): T => …`, each also through
// `export { x }` and `export { x as y }`. Not recognized: `satisfies T`, `as T`, an unannotated value, an
// `export { x } from` re-export, an alias of the type. A factory yields a fresh object per call, so identity cannot
// prove it; the per-kind id count is the only evidence that a surplus factory is unwired. The `-section` suffix is
// shared by settings sections and context tabs, and `-mode` files are corpus modes: none of those is a registered
// definition kind here, so such a file owns its feature only through the weaker proof that an export of it is
// imported by name in `compose/`, which does not show the import is used.
const DEFINITION_KINDS = [
  { type: "ChromeEntry", slot: "chrome", ids: undefined, registered: (): readonly unknown[] => composition.chrome.list() },
  { type: "ModalDefinition", slot: "modal", ids: MODAL_SLOT_IDS.length, registered: (): readonly unknown[] => composition.modals.list() },
  { type: "HomeTileContribution", slot: "tile", ids: undefined, registered: (): readonly unknown[] => homeTiles.list() },
  { type: "SectionDefinition", slot: "section", ids: SECTION_IDS.length, registered: (): readonly unknown[] => composition.sections.list() },
  {
    type: "ConfigGroupDefinition",
    slot: "group",
    ids: CONFIG_GROUP_IDS.length,
    registered: (): readonly unknown[] => CONFIG_GROUP_IDS.map((id) => composition.configGroups.get(id)),
  },
] as const;

const isExported = (node: ts.Node): boolean => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/**
 * Constants annotated `: type`, and functions or arrows returning `: type`, by the names the module EXPORTS
 * them under: an `export` modifier, `export { x }` and `export { x as y }` all count.
 */
function declaredAs(file: string, text: string, type: string): { readonly consts: readonly string[]; readonly factories: readonly string[] } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const isType = (node: ts.TypeNode | undefined): boolean => node !== undefined && ts.isTypeReferenceNode(node) && node.typeName.getText(source) === type;
  const isFactory = (declaration: ts.VariableDeclaration): boolean =>
    declaration.initializer !== undefined && ts.isArrowFunction(declaration.initializer) && isType(declaration.initializer.type);
  const specifiers = source.statements
    .filter(ts.isExportDeclaration)
    .filter((declaration) => declaration.moduleSpecifier === undefined && declaration.exportClause !== undefined && ts.isNamedExports(declaration.exportClause))
    .flatMap((declaration) =>
      declaration.exportClause !== undefined && ts.isNamedExports(declaration.exportClause) ? [...declaration.exportClause.elements] : [],
    );
  const exportedAs = (local: string, direct: boolean): readonly string[] => [
    ...(direct ? [local] : []),
    ...specifiers.filter((specifier) => (specifier.propertyName ?? specifier.name).text === local).map((specifier) => specifier.name.text),
  ];
  const declarations = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations].map((declaration) => ({ declaration, direct: isExported(statement) })));
  return {
    consts: declarations
      .filter(({ declaration }) => isType(declaration.type))
      .flatMap(({ declaration, direct }) => exportedAs(declaration.name.getText(source), direct)),
    factories: [
      ...source.statements
        .filter(ts.isFunctionDeclaration)
        .filter((fn) => isType(fn.type))
        .flatMap((fn) => exportedAs(fn.name?.text ?? "default", isExported(fn))),
      ...declarations
        .filter(({ declaration }) => isFactory(declaration))
        .flatMap(({ declaration, direct }) => exportedAs(declaration.name.getText(source), direct)),
    ],
  };
}

interface KindJudgement {
  readonly faults: readonly string[];
  /** Features holding at least one wired constant or one factory of this kind. */
  readonly owners: ReadonlySet<string>;
}

interface KindInput {
  /** Feature-relative paths, `<feature>/lib/<name>-<slot>.ts(x)`. */
  readonly files: readonly string[];
  readonly read: (file: string) => string;
  readonly load: (file: string) => Promise<Readonly<Record<string, unknown>>>;
  readonly type: string;
  /** Whether the door holds this exported constant. */
  readonly isHeld: (name: string, value: unknown) => boolean;
  /** Where the door holds exactly one definition per id, the count the declarations must equal: a surplus factory or constant is an unwired one. */
  readonly ids: number | undefined;
}

/** Every declared constant is held by the door and the declarations match the id count. A file that declares none owns nothing. */
async function judgeKind({ files, read, load, type, isHeld, ids }: KindInput): Promise<KindJudgement> {
  const faults: string[] = [];
  const owners = new Set<string>();
  let definitions = 0;
  for (const file of files) {
    const declared = declaredAs(file, read(file), type);
    const feature = file.slice(0, file.indexOf("/"));
    definitions += declared.consts.length + declared.factories.length;
    if (declared.factories.length > 0) {
      owners.add(feature);
    }
    const exported = declared.consts.length > 0 ? await load(file) : {};
    for (const name of declared.consts) {
      if (isHeld(name, exported[name])) {
        owners.add(feature);
      } else {
        faults.push(`${file} exports ${name}: ${type} but the door does not hold it`);
      }
    }
  }
  if (ids !== undefined && definitions !== ids) {
    faults.push(`${type} definitions ${String(definitions)} vs ${String(ids)} ids`);
  }
  return { faults, owners };
}

const realFiles = (slot: string): readonly string[] => [
  ...globSync(`*/lib/*-${slot}.ts`, { cwd: FEATURES }),
  ...globSync(`*/lib/*-${slot}.tsx`, { cwd: FEATURES }),
];
const realLoad: KindInput["load"] = async (file) => await import(/* @vite-ignore */ `${FEATURES}/${file}`);
const realInput = (slot: string): Pick<KindInput, "files" | "read" | "load"> => ({
  files: realFiles(slot),
  read: (file) => readFileSync(`${FEATURES}/${file}`, "utf8"),
  load: realLoad,
});

const COMPOSE = fileURLToPath(new URL("../../../packages/client/src/compose", import.meta.url));

/** The names `compose/` imports by name from anywhere: the weak registration proof for forms no registry holds. */
function composedNames(): ReadonlySet<string> {
  return new Set(
    globSync("*.{ts,tsx}", { cwd: COMPOSE }).flatMap((file) =>
      ts
        .createSourceFile(file, readFileSync(`${COMPOSE}/${file}`, "utf8"), ts.ScriptTarget.Latest, true)
        .statements.filter(ts.isImportDeclaration)
        .flatMap(({ importClause }) =>
          importClause?.namedBindings !== undefined && ts.isNamedImports(importClause.namedBindings)
            ? importClause.namedBindings.elements.map(({ name, propertyName }) => (propertyName ?? name).text)
            : [],
        ),
    ),
  );
}

/** Features owning a file one of whose exports `compose/` imports by name. */
async function composedOwners(files: readonly string[], load: KindInput["load"], composed: ReadonlySet<string>): Promise<ReadonlySet<string>> {
  const owners = new Set<string>();
  for (const file of files) {
    if (Object.keys(await load(file)).some((name) => composed.has(name))) {
      owners.add(file.slice(0, file.indexOf("/")));
    }
  }
  return owners;
}

const SLOTS = [...DEFINITION_KINDS.map(({ slot }) => slot), "mode"];

/** Features owning a definition: a held typed one, or an export of a definition-shaped file that `compose/` imports. */
async function ownersOf(
  kinds: readonly KindJudgement[],
  files: readonly string[],
  load: KindInput["load"],
  composed: ReadonlySet<string>,
): Promise<ReadonlySet<string>> {
  return new Set([...kinds.flatMap(({ owners }) => [...owners]), ...(await composedOwners(files, load, composed))]);
}

const realJudgements = async (): Promise<readonly KindJudgement[]> =>
  await Promise.all(
    DEFINITION_KINDS.map(async ({ type, slot, registered, ids }) => {
      const held = new Set<unknown>(registered());
      return await judgeKind({ ...realInput(slot), type, isHeld: (_, value) => held.has(value), ids });
    }),
  );

for (const { type, slot, registered, ids } of DEFINITION_KINDS) {
  test(`every co-located ${type} is wired into the door`, async () => {
    const held = new Set<unknown>(registered());
    const { faults } = await judgeKind({ ...realInput(slot), type, isHeld: (_, value) => held.has(value), ids });
    expect(faults).toEqual([]);
  });
}

test("every feature directory owns a wired definition, not only a definition-shaped file", async () => {
  const features = readdirSync(FEATURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  expect(features).toContain("chat");
  const owners = await ownersOf(await realJudgements(), SLOTS.flatMap(realFiles), realLoad, composedNames());
  expect(features.filter((feature) => !owners.has(feature))).toEqual([]);
});

// Planted controls: the same judge and ownership proof over files that name a definition without being one.
async function plantedOwners(
  files: Readonly<Record<string, string>>,
  exportsOf: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  wired: readonly unknown[],
  composed: readonly string[],
): Promise<{ readonly faults: readonly string[]; readonly owners: readonly string[] }> {
  const load: KindInput["load"] = (file) => Promise.resolve(exportsOf[file] ?? {});
  const judged = await judgeKind({
    files: Object.keys(files),
    read: (file) => files[file] ?? "",
    load,
    type: "SectionDefinition",
    isHeld: (_, value) => wired.includes(value),
    ids: undefined,
  });
  return { faults: judged.faults, owners: [...(await ownersOf([judged], Object.keys(files), load, new Set(composed)))].toSorted() };
}

test("a definition-shaped helper owns nothing", async () => {
  const helper = { "helper/lib/fake-section.ts": "export const buildSection = () => ({ id: 'x' });\n" };
  expect(await plantedOwners(helper, { "helper/lib/fake-section.ts": { buildSection: () => ({ id: "x" }) } }, [], [])).toEqual({ faults: [], owners: [] });
});

test("an annotated definition the door does not hold is reported and owns nothing", async () => {
  const orphan = { "orphan/lib/orphan-section.ts": "export const orphanSection: SectionDefinition = { id: 'orphan' };\n" };
  expect(await plantedOwners(orphan, { "orphan/lib/orphan-section.ts": { orphanSection: { id: "orphan" } } }, [], [])).toEqual({
    faults: ["orphan/lib/orphan-section.ts exports orphanSection: SectionDefinition but the door does not hold it"],
    owners: [],
  });
});

test("a held annotated constant, a re-exported one and an annotated factory each own their feature", async () => {
  const kept = { id: "kept" };
  const aliased = { id: "aliased" };
  const result = await plantedOwners(
    {
      "kept/lib/kept-section.ts": "export const keptSection: SectionDefinition = { id: 'kept' };\n",
      "alias/lib/alias-section.ts": "const inner: SectionDefinition = { id: 'aliased' };\nexport { inner as aliasSection };\n",
      "made/lib/made-section.ts": "export const makeSection = (): SectionDefinition => ({ id: 'made' });\n",
    },
    { "kept/lib/kept-section.ts": { keptSection: kept }, "alias/lib/alias-section.ts": { aliasSection: aliased } },
    [kept, aliased],
    [],
  );
  expect(result).toEqual({ faults: [], owners: ["alias", "kept", "made"] });
});

test("a definition spelled outside the recognized forms owns nothing unless compose imports it", async () => {
  const loose = { "loose/lib/loose-section.ts": "export const looseSection = { id: 'x' } satisfies SectionDefinition;\n" };
  const exportsOf = { "loose/lib/loose-section.ts": { looseSection: { id: "x" } } };
  expect((await plantedOwners(loose, exportsOf, [], [])).owners).toEqual([]);
  expect((await plantedOwners(loose, exportsOf, [], ["looseSection"])).owners).toEqual(["loose"]);
});
