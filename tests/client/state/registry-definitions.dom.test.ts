import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HomeTileContribution, SectionDefinition } from "@orb/client/state";
import { assembleChrome, CONFIG_GROUP_IDS, isCollectionGroup, SECTION_IDS } from "@orb/client/state";
import { chromeWidgets, createAuthedComposition, createClientRuntime, homeTiles } from "@orb/testkit/browser/ct-door.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import ts from "typescript";

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
// copy would rot unseen. Discover the declarations by annotation, then demand the door holds each one.
const DEFINITION_KINDS = [
  { type: "ChromeEntry", slot: "chrome", ids: undefined, registered: (): readonly unknown[] => composition.chrome.list() },
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
function declaredAs(file: string, type: string): { readonly consts: readonly string[]; readonly factories: readonly string[] } {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
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

for (const { type, slot, registered, ids } of DEFINITION_KINDS) {
  test(`every co-located ${type} is wired into the door`, async () => {
    const files = [...globSync(`*/lib/*-${slot}.ts`, { cwd: FEATURES }), ...globSync(`*/lib/*-${slot}.tsx`, { cwd: FEATURES })];
    const held = new Set<unknown>(registered());
    let factories = 0;
    let constants = 0;
    for (const file of files) {
      const path = `${FEATURES}/${file}`;
      const declared = declaredAs(path, type);
      factories += declared.factories.length;
      constants += declared.consts.length;
      const exported: Record<string, unknown> = await import(/* @vite-ignore */ path);
      for (const name of declared.consts) {
        expect(held.has(exported[name]), `${file} exports ${name}: ${type} but the door does not hold it`).toBe(true);
      }
    }
    expect(constants + factories, `${type} definitions found`).toBeGreaterThan(0);
    // A factory yields a fresh object per call, so identity cannot prove it; where the door holds exactly one
    // definition per id, a surplus factory or constant is an unwired one.
    expect(constants + factories, `${type} definitions vs ids`).toBe(ids ?? constants + factories);
  });
}
