// @subject tooling/src/floor/code-facts/schema-projection.ts
// @subject tooling/src/floor/code-facts/schema-projection-replay.ts
// @subject tooling/src/floor/code-facts/schema-projection-inventory-contract.ts
// @subject tooling/src/floor/compiler/schema-projection-encode.ts
import { join } from "node:path";
import { nativeFixture, SCOPE_HEAD } from "@orb/testkit/node/native-drizzle.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, Project } from "ts-morph";
import { vi } from "vitest";
import { projectSchemaData, readSchemaData } from "../../../../tooling/src/floor/code-facts/schema-projection.ts";
import { schemaProjectionInventorySchema } from "../../../../tooling/src/floor/code-facts/schema-projection-inventory-contract.ts";
import { replaySchemaDataCatalog } from "../../../../tooling/src/floor/code-facts/schema-projection-replay.ts";
import { createSchemaQuery } from "../../../../tooling/src/floor/code-facts/schema-query.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { drizzleSchemas, spanSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { encodeSchemaDataCatalog } from "../../../../tooling/src/floor/compiler/schema-projection-encode.ts";
import { scaledBudget } from "../../_load-budget.ts";

const IDS = "packages/kit/src/ids/index.ts";
const EXTRA = `
import { foreignKey, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { ChatId } from '../../../kit/src/ids/index.ts';
export const projectionParents = sqliteTable('projection_parents', { id: text('id').primaryKey().$type<ChatId>(), code: text('code').notNull() });
export const projectionRows = sqliteTable('projection_rows', {
 parentId: text('parent_id').$type<ChatId>().references(()=>projectionParents.id,{onDelete:'cascade'}),
 code: text('code').notNull(),
 blank: text(''),
 omitted: text(),
 absent: text(undefined),
 defaults: text('defaults').default('initial').$defaultFn(()=>'new').$default(()=>'other').$onUpdate(()=>'update').$onUpdateFn(()=>'last'),
 profile: text('profile',{mode:'json'}).$type<{name:string; nested:{count:number}}>(),
 union: text('union',{mode:'json'}).$type<{left:string}|{right:number}>(),
 scalar: text('scalar',{mode:'json'}).$type<readonly string[]>(),
 open: text('open',{mode:'json'}).$type<Record<string,unknown>>(),
 untyped: text('untyped',{mode:'json'}),
}, t=>[
 index('projection_parent_idx').on(t.parentId,sql\`lower(\${t.code})\`),
 uniqueIndex('projection_pair_idx').on(t.parentId,t.code),
 primaryKey({columns:[t.parentId,t.code]}),
 foreignKey({columns:[t.parentId,t.code],foreignColumns:[projectionParents.id,projectionParents.code]}).onDelete('restrict'),
]);
`;

function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function replayFrom(project: Project, carriers: Project): (value: InventorySpan) => MorphNode {
  return (value) => {
    const source = project.getSourceFileOrThrow(value.file);
    const carrier = carriers.getSourceFile(value.file) ?? carriers.createSourceFile(value.file, source.getFullText());
    const leaf = carrier.getDescendantAtPos(value.start);
    const node = [carrier, leaf, ...(leaf?.getAncestors() ?? [])].find(
      (candidate) => candidate?.getStart() === value.start && candidate.getEnd() === value.end && candidate.getKind() === value.kind,
    );
    if (node === undefined) {
      throw new Error("owned schema projection span is missing");
    }
    return node;
  };
}

test(
  "complete schema projection roundtrips defaults, all constraints and JSON without live Types",
  async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      { producer: `${SCOPE_HEAD}export const read=(db:Db)=>db.select().from(assets);`, recipient: "" },
    );
    fixture.project.createSourceFile(join(fixture.root, IDS), 'declare const brand:unique symbol;export type ChatId=string & {readonly [brand]:"chat"};');
    const source = fixture.project.getSourceFileOrThrow(join(fixture.root, "packages/db/src/schema/persona.ts"));
    source.addStatements(EXTRA);
    const options = {
      files: [source],
      relativePath: (file: SourceFile): string => file.getFilePath().slice(fixture.root.length + 1),
      checker: () => fixture.project.getTypeChecker(),
    };
    const canonical = createSchemaQuery(options).schema();
    const projected = readSchemaData(options);
    expect(projected.status).toBe("ready");
    expect(projected.receipt).toEqual(canonical.receipt);
    expect(projected).toEqual(projectSchemaData(canonical));
    if (projected.status !== "ready" || canonical.status !== "ready") {
      throw new Error("complete canonical schema projection is unavailable");
    }
    const rows = projected.value.tables.find((table) => table.identity.declarationName === "projectionRows");
    expect(
      rows?.columns.map((column) => ({
        name: column.identity.propertyName,
        sql: column.sqlName,
        defaults: column.defaultOperations,
        json: column.json?.shape.kind,
      })),
    ).toEqual([
      { name: "parentId", sql: "parent_id", defaults: [], json: undefined },
      { name: "code", sql: "code", defaults: [], json: undefined },
      { name: "blank", sql: "blank", defaults: [], json: undefined },
      { name: "omitted", sql: "omitted", defaults: [], json: undefined },
      { name: "absent", sql: "absent", defaults: [], json: undefined },
      { name: "defaults", sql: "defaults", defaults: ["default", "$defaultFn", "$default", "$onUpdate", "$onUpdateFn"], json: undefined },
      { name: "profile", sql: "profile", defaults: [], json: "closed" },
      { name: "union", sql: "union", defaults: [], json: "closed" },
      { name: "scalar", sql: "scalar", defaults: [], json: "scalar" },
      { name: "open", sql: "open", defaults: [], json: "open" },
      { name: "untyped", sql: "untyped", defaults: [], json: "open" },
    ]);
    expect(rows?.columns.find((column) => column.identity.propertyName === "parentId")?.typeOverride?.idBrand).toBe('"chat"');
    expect(rows?.columns.find((column) => column.identity.propertyName === "profile")?.json?.shape).toMatchObject({ kind: "closed", keys: ["name", "nested"] });
    expect(rows?.columns.find((column) => column.identity.propertyName === "union")?.json?.shape).toMatchObject({ kind: "closed", keys: ["left", "right"] });
    expect(rows?.indexes.map((index) => ({ kind: index.kind, terms: index.terms.map((term) => term.kind) }))).toEqual([
      { kind: "index", terms: ["column", "expression"] },
      { kind: "unique-index", terms: ["column", "column"] },
      { kind: "primary-key", terms: ["column", "column"] },
    ]);
    expect(rows?.foreignKeys).toMatchObject([
      {
        children: [{ propertyName: "parentId" }, { propertyName: "code" }],
        parents: [{ kind: "population-column" }, { kind: "population-column" }],
        onDelete: { kind: "specified", value: "restrict" },
      },
    ]);
    const wire = encodeSchemaDataCatalog(options.files, projected, span, { relativePath: options.relativePath });
    const carriers = new Project({ useInMemoryFileSystem: true });
    const replay = replayFrom(fixture.project, carriers);
    const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(() => {
      throw new Error("schema replay cannot read Symbol");
    });
    const types = vi.spyOn(Node.prototype, "getType").mockImplementation(() => {
      throw new Error("schema replay cannot read Type");
    });
    try {
      const restored = replaySchemaDataCatalog(wire, replay);
      expect(encodeSchemaDataCatalog([carriers.getSourceFileOrThrow(source.getFilePath())], restored, span, { relativePath: options.relativePath })).toEqual(
        wire,
      );
      if (restored.status !== "ready") {
        throw new Error("schema replay is unavailable");
      }
      for (const table of restored.value.tables) {
        expect(table.declaration.getSourceFile()).toBe(carriers.getSourceFileOrThrow(table.declaration.getSourceFile().getFilePath()));
      }
      const overrides = restored.value.tables.flatMap((table) =>
        table.columns.flatMap((column) => (column.typeOverride === null ? [] : [column.typeOverride])),
      );
      expect(overrides.length).toBeGreaterThan(0);
      expect(overrides.every((override) => !Reflect.has(override, "type"))).toBe(true);
    } finally {
      symbols.mockRestore();
      types.mockRestore();
    }
    const schema = schemaProjectionInventorySchema(spanSchema, drizzleSchemas.catalog);
    const missing = structuredClone(wire);
    if (missing.fact.status !== "ready") {
      throw new Error("corruption fixture is unavailable");
    }
    const first = missing.fact.value.tables[0];
    if (first === undefined) {
      throw new Error("corruption fixture has no table");
    }
    Reflect.deleteProperty(first, "columns");
    expect(schema.safeParse(missing).success).toBe(false);
    expect(() => replaySchemaDataCatalog({ ...wire, sources: [] }, replay)).toThrow("roster coverage");
    const truncated = structuredClone(wire);
    if (truncated.fact.status !== "ready") {
      throw new Error("truncation fixture is unavailable");
    }
    const truncatedTable = truncated.fact.value.tables[0];
    if (truncatedTable === undefined) {
      throw new Error("truncation fixture has no table");
    }
    Reflect.set(truncatedTable, "columns", []);
    expect(schema.safeParse(truncated).success).toBe(false);
    const invalid = structuredClone(wire);
    if (invalid.fact.status !== "ready") {
      throw new Error("invalid nested fixture is unavailable");
    }
    const invalidRows = invalid.fact.value.tables.find((table) => table.identity.declarationName === "projectionRows");
    const typedColumn = invalidRows?.columns.find((column) => column.identity.propertyName === "profile");
    if (typedColumn?.typeOverride === undefined || typedColumn.typeOverride === null) {
      throw new Error("invalid nested fixture has no typed column");
    }
    Reflect.set(typedColumn.typeOverride, "type", {});
    expect(schema.safeParse(invalid).success).toBe(false);
    Reflect.deleteProperty(typedColumn.typeOverride, "type");
    const foreign = { ...typedColumn.builder.call, file: "/foreign.ts" };
    Reflect.set(typedColumn.builder, "call", foreign);
    expect(() => replaySchemaDataCatalog(invalid, replay)).toThrow();
    const carrier = carriers.getSourceFileOrThrow(source.getFilePath());
    carrier.replaceWithText(carrier.getFullText().replace("projection_rows", "projection_rowZ"));
    expect(() => replaySchemaDataCatalog(wire, replay)).toThrow("missing or stale");
  },
  scaledBudget(30_000),
);

test(
  "schema data projection retains canonical missing, empty and complete-extraction refusals",
  async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      { producer: `${SCOPE_HEAD}export const read=(db:Db)=>db.select().from(assets);`, recipient: "" },
    );
    const source = fixture.project.getSourceFileOrThrow(join(fixture.root, "packages/db/src/schema/persona.ts"));
    const options = {
      files: [source],
      relativePath: (file: SourceFile): string => file.getFilePath().slice(fixture.root.length + 1),
      checker: () => fixture.project.getTypeChecker(),
    };
    expect(readSchemaData({ ...options, files: [] })).toEqual(createSchemaQuery({ ...options, files: [] }).schema());
    source.replaceWithText("export const empty=true;");
    expect(readSchemaData(options)).toMatchObject({ status: "empty", receipt: { members: 0 } });
    for (const suffix of [
      "{profile:text('profile',{mode:'json'}).$type<{a:string}>().$type<{b:string}>()}",
      "{id:text('id')},t=>[index('broken')]",
      "{id:text('id').references(()=>missing.id)}",
      "{id:text('id').default(getDefault())},t=>[foreignKey({columns:[t.id],foreignColumns:[]})]",
    ]) {
      source.replaceWithText(
        `import{sqliteTable,text,index,foreignKey}from'drizzle-orm/sqlite-core';declare function getDefault():string;export const rows=sqliteTable('rows',${suffix});`,
      );
      const full = createSchemaQuery(options).schema();
      expect(full.status).toBe("unresolved");
      expect(readSchemaData(options)).toEqual(full);
      const projected = readSchemaData(options);
      const wire = encodeSchemaDataCatalog(options.files, projected, span, { relativePath: options.relativePath });
      expect(replaySchemaDataCatalog(wire, replayFrom(fixture.project, new Project({ useInMemoryFileSystem: true })))).toEqual(projected);
    }
  },
  scaledBudget(30_000),
);

test(
  "selected canonical schema Types supply opted-in vocabulary and default catalog data remains identical",
  async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      { producer: `${SCOPE_HEAD}export const read=(db:Db)=>db.select().from(assets);`, recipient: "" },
    );
    const source = fixture.project.getSourceFileOrThrow(join(fixture.root, "packages/db/src/schema/persona.ts"));
    source.addStatements(
      "interface NamedBag { readonly [key:string]:unknown; fixed?:string }\nexport const selected=sqliteTable('selected',{value:text('value',{mode:'json'}).$type<NamedBag>(), scalar:text('scalar',{mode:'json'}).$type<string|{key:number}|null>()});",
    );
    const options = {
      files: [source],
      relativePath: (file: SourceFile): string => file.getFilePath().slice(fixture.root.length + 1),
      checker: () => fixture.project.getTypeChecker(),
    };
    const canonical = createSchemaQuery(options).schema();
    expect(canonical.status).toBe("ready");
    const ordinary = projectSchemaData(canonical);
    const getType = Node.prototype.getType;
    const syntaxType = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === fixture.project) {
        throw new Error("schema override node Type read instead of canonical selected Type");
      }
      return getType.call(this);
    });
    try {
      const projection = { typeVocabulary: true } as const;
      const full = projectSchemaData(canonical, projection);
      if (full.status !== "ready") {
        throw new Error("selected-Type catalog unavailable");
      }
      const selected = full.value.tables.find((table) => table.sqlName === "selected");
      expect(selected?.columns[0]?.typeOverride?.vocabulary).toMatchObject({
        properties: ["fixed"],
        arms: [{ symbolName: "NamedBag", stringIndex: true, unknown: false, properties: ["fixed"] }],
      });
      expect(selected?.columns[1]?.typeOverride?.vocabulary?.arms.map((arm) => ({ null: arm.null, string: arm.string, properties: arm.properties }))).toEqual(
        expect.arrayContaining([
          { null: true, string: false, properties: [] },
          { null: false, string: false, properties: ["key"] },
        ]),
      );
      const wire = encodeSchemaDataCatalog(options.files, full, span, { relativePath: options.relativePath, projection });
      const carriers = new Project({ useInMemoryFileSystem: true });
      const replay = replayFrom(fixture.project, carriers);
      expect(replaySchemaDataCatalog(wire, replay, {})).toEqual(
        replaySchemaDataCatalog(encodeSchemaDataCatalog(options.files, ordinary, span, { relativePath: options.relativePath }), replay),
      );
      const restored = replaySchemaDataCatalog(wire, replay, projection);
      expect(
        restored.status === "ready" ? restored.value.tables.find((table) => table.sqlName === "selected")?.columns[0]?.typeOverride?.vocabulary : undefined,
      ).toEqual(selected?.columns[0]?.typeOverride?.vocabulary);
      expect(() =>
        replaySchemaDataCatalog(encodeSchemaDataCatalog(options.files, ordinary, span, { relativePath: options.relativePath }), replay, projection),
      ).toThrow("vocabulary was not captured");
      const invalid = structuredClone(wire);
      if (invalid.fact.status !== "ready") {
        throw new Error("wire schema unavailable");
      }
      const override = invalid.fact.value.tables.find((table) => table.sqlName === "selected")?.columns[0]?.typeOverride;
      if (override === undefined || override === null) {
        throw new Error("wire override unavailable");
      }
      expect(
        schemaProjectionInventorySchema(spanSchema, drizzleSchemas.catalog).safeParse({
          ...invalid,
          fact: {
            ...invalid.fact,
            value: {
              tables: invalid.fact.value.tables.map((table) => ({
                ...table,
                columns: table.columns.map((column) =>
                  column.typeOverride === null
                    ? column
                    : {
                        ...column,
                        typeOverride: { node: column.typeOverride.node, display: column.typeOverride.display, idBrand: column.typeOverride.idBrand },
                      },
                ),
              })),
            },
          },
        }).success,
      ).toBe(false);
    } finally {
      syntaxType.mockRestore();
    }
  },
  scaledBudget(60_000),
);
