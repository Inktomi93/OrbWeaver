// The physical prior CHECK is a snapshot; deriving it from current DDL would erase the upgrade discriminator.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import type { StatementSync } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventoryPartition } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { INVENTORY_FORMAT, inventoryFamilies } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import {
  beginInventoryWrite,
  importInventoryPartition,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import {
  readInventoryBindings,
  readInventoryDeclarationOutputs,
  readInventoryExportDeclarations,
  readInventoryInputs,
  readInventoryPairs,
  readInventoryReferences,
  readInventoryRuntimeExports,
  readInventoryShape,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryString, inventoryTextParts, inventoryTextVersion } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";

const FORMAT4_DDL = `CREATE TABLE inventory_partition(id TEXT PRIMARY KEY, program TEXT NOT NULL, format INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE inventory_generation(id INTEGER PRIMARY KEY, format INTEGER NOT NULL);
CREATE TABLE inventory_member(generation INTEGER NOT NULL REFERENCES inventory_generation(id), program TEXT NOT NULL, partition TEXT NOT NULL REFERENCES inventory_partition(id), PRIMARY KEY(generation,program));
CREATE TABLE inventory_descriptor(partition TEXT NOT NULL REFERENCES inventory_partition(id) PRIMARY KEY,program TEXT NOT NULL,descriptorVersion TEXT NOT NULL,compilerOptionsJson TEXT NOT NULL,workerPid INTEGER) STRICT;
CREATE TABLE inventory_family(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,name TEXT NOT NULL CHECK(name IN ('exports','modules','bindings','references','witnesses','cast-relations')),PRIMARY KEY(partition,ordinal),UNIQUE(partition,name)) STRICT;
CREATE TABLE inventory_list(partition TEXT NOT NULL REFERENCES inventory_partition(id),kind TEXT NOT NULL CHECK(kind IN ('configPaths','projectReferences','roots','nativeRoots')),ordinal INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(partition,kind,ordinal)) STRICT;
CREATE TABLE inventory_input(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,path TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('file','directory','exists')),version TEXT NOT NULL,PRIMARY KEY(partition,ordinal)) STRICT;
CREATE TABLE inventory_source(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,file TEXT NOT NULL,path TEXT NOT NULL,consumerClass TEXT NOT NULL CHECK(consumerClass IN ('product','tooling','test')),authored INTEGER NOT NULL CHECK(authored IN (0,1)),textVersion TEXT NOT NULL,textLength INTEGER NOT NULL,textParts INTEGER NOT NULL,PRIMARY KEY(partition,ordinal)) STRICT;
CREATE TABLE inventory_text(partition TEXT NOT NULL REFERENCES inventory_partition(id),source INTEGER NOT NULL,ordinal INTEGER NOT NULL,value TEXT NOT NULL CHECK(json_valid(value) AND json_type(value)='text' AND length(value)<=98306),PRIMARY KEY(partition,source,ordinal),FOREIGN KEY(partition,source) REFERENCES inventory_source(partition,ordinal)) STRICT;
CREATE TABLE inventory_span(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,file TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,kind INTEGER NOT NULL,PRIMARY KEY(partition,ordinal),UNIQUE(partition,file,start,end,kind)) STRICT;
CREATE TABLE inventory_fact(partition TEXT NOT NULL REFERENCES inventory_partition(id),kind TEXT NOT NULL CHECK(kind IN ('exports','modules','bindings','witnesses')),ordinal INTEGER NOT NULL,file TEXT,name TEXT,node INTEGER,target TEXT,dynamic INTEGER CHECK(dynamic IN (0,1)),specifier TEXT,PRIMARY KEY(partition,kind,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),CHECK((kind='exports' AND file IS NOT NULL AND name IS NOT NULL AND node IS NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL) OR (kind='modules' AND file IS NULL AND name IS NULL AND node IS NOT NULL AND dynamic IS NOT NULL) OR (kind='bindings' AND file IS NULL AND name IS NULL AND node IS NOT NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL) OR (kind='witnesses' AND file IS NULL AND name IS NOT NULL AND node IS NOT NULL AND target IS NULL AND dynamic IS NULL AND specifier IS NULL))) STRICT;
CREATE TABLE inventory_declaration(partition TEXT NOT NULL REFERENCES inventory_partition(id),kind TEXT NOT NULL,owner INTEGER NOT NULL,role TEXT NOT NULL,ordinal INTEGER NOT NULL,node INTEGER NOT NULL,PRIMARY KEY(partition,kind,owner,role,ordinal),FOREIGN KEY(partition,kind,owner) REFERENCES inventory_fact(partition,kind,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),CHECK((kind='bindings' AND role IN ('lexical','origins')) OR (kind IN ('exports','modules','witnesses') AND role='declarations'))) STRICT;
CREATE TABLE inventory_reference(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,declaration INTEGER NOT NULL,node INTEGER NOT NULL,consumerClass TEXT NOT NULL CHECK(consumerClass IN ('product','tooling','test')),PRIMARY KEY(partition,ordinal),FOREIGN KEY(partition,declaration) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;
CREATE TABLE inventory_cast(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,leftToRight INTEGER CHECK(leftToRight IN (0,1)),rightToLeft INTEGER CHECK(rightToLeft IN (0,1)),leftIsAny INTEGER CHECK(leftIsAny IN (0,1)),rightIsAny INTEGER CHECK(rightIsAny IN (0,1)),reason TEXT,PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),CHECK((reason IS NULL AND leftToRight IS NOT NULL AND rightToLeft IS NOT NULL AND leftIsAny IS NOT NULL AND rightIsAny IS NOT NULL) OR (reason='primitive-absent' AND leftToRight IS NULL AND rightToLeft IS NULL AND leftIsAny IS NULL AND rightIsAny IS NULL))) STRICT;`;
const LEGACY_PARTITION = "legacy-four";
const STORAGE_VERSION = "PRAGMA user_version";
const FORMAT5_DDL = `${FORMAT4_DDL.replace("'witnesses','cast-relations'", "'witnesses','cast-relations','id-brands'")}
CREATE TABLE inventory_brand(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,brand TEXT,PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;

const FORMAT6_DDL = FORMAT5_DDL.replace("('file','directory','exists')", "('file','directory','exists','authored')");
const FORMAT7_DDL = `${FORMAT6_DDL.replace("'cast-relations','id-brands'", "'cast-relations','id-brands','runtime-exports'")}
CREATE TABLE inventory_runtime_export(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,file TEXT NOT NULL,name TEXT NOT NULL,node INTEGER NOT NULL,callable INTEGER NOT NULL CHECK(callable IN (0,1)),initializerKind INTEGER,initializerCallable INTEGER CHECK(initializerCallable IN (0,1)),PRIMARY KEY(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),CHECK((initializerKind IS NULL AND initializerCallable IS NULL) OR (initializerKind IS NOT NULL AND initializerCallable IS NOT NULL))) STRICT;`;
const FORMAT8_DDL = `${FORMAT7_DDL.replace("'id-brands','runtime-exports'", "'id-brands','runtime-exports','shape-catalog','shape-pairs'")
  .replace("'roots','nativeRoots'", "'roots','nativeRoots','available'")
  .replace("workerPid INTEGER)", "workerPid INTEGER,intent TEXT NOT NULL DEFAULT 'facts' CHECK(intent IN ('facts','membership')))")}
CREATE TABLE inventory_shape(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,copyObject INTEGER NOT NULL CHECK(copyObject IN (0,1)),respellObject INTEGER NOT NULL CHECK(respellObject IN (0,1)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;
CREATE TABLE inventory_shape_field(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('copy','respell')),ordinal INTEGER NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,PRIMARY KEY(partition,owner,mode,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_shape(partition,ordinal)) STRICT;
CREATE TABLE inventory_shape_origin(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('direct','queries')),ordinal INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(partition,owner,kind,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_shape(partition,ordinal)) STRICT;
CREATE TABLE inventory_pair(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,key TEXT NOT NULL,leftNode INTEGER NOT NULL,rightNode INTEGER NOT NULL,leftField TEXT,rightField TEXT,projection TEXT NOT NULL CHECK(projection IN ('mutual','relation')),lenient INTEGER NOT NULL CHECK(lenient IN (0,1)),state TEXT NOT NULL CHECK(state IN ('answer','no-comparable','unavailable')),reason TEXT,a INTEGER CHECK(a IN (0,1)),b INTEGER CHECK(b IN (0,1)),c INTEGER CHECK(c IN (0,1)),d INTEGER CHECK(d IN (0,1)),CHECK((state='answer' AND reason IS NULL AND a IS NOT NULL AND ((projection='mutual' AND b IS NULL AND c IS NULL AND d IS NULL) OR (projection='relation' AND b IS NOT NULL AND c IS NOT NULL AND d IS NOT NULL))) OR (state='no-comparable' AND projection='relation' AND reason IS NULL AND a IS NULL AND b IS NULL AND c IS NULL AND d IS NULL) OR (state='unavailable' AND reason IN ('primitive-absent','node-absent') AND a IS NULL AND b IS NULL AND c IS NULL AND d IS NULL)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,key),FOREIGN KEY(partition,leftNode) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,rightNode) REFERENCES inventory_span(partition,ordinal)) STRICT;`;
const FORMAT9_DDL = `${FORMAT8_DDL.replace("'shape-catalog','shape-pairs'", "'shape-catalog','shape-pairs','declaration-outputs'")}
CREATE TABLE inventory_declaration_output(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,unknownOutput INTEGER CHECK(unknownOutput IN (0,1)),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;
const FORMAT10_DDL = `${FORMAT9_DDL.replace("'shape-pairs','declaration-outputs'", "'shape-pairs','declaration-outputs','type-member-origins'")}
CREATE TABLE inventory_member_origin(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,name TEXT,leaf INTEGER,origin INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('resolved','unresolved')),reason TEXT,detail TEXT,refusalNode INTEGER,valueCount INTEGER NOT NULL CHECK(valueCount>=0),traceCount INTEGER NOT NULL CHECK(traceCount>=0),leafCount INTEGER CHECK(leafCount>=0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,leaf) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,origin) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,refusalNode) REFERENCES inventory_span(partition,ordinal),CHECK((state='resolved' AND name IS NOT NULL AND reason IS NULL AND detail IS NULL AND refusalNode IS NULL AND valueCount>0) OR (state='unresolved' AND reason IS NOT NULL AND detail IS NOT NULL AND refusalNode IS NOT NULL AND valueCount=0))) STRICT;
CREATE TABLE inventory_member_declaration(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,role TEXT NOT NULL CHECK(role IN ('value','trace')),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,PRIMARY KEY(partition,owner,role,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_member_origin(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;
const FORMAT11_DDL = `${FORMAT10_DDL.replace("'declaration-outputs','type-member-origins'", "'declaration-outputs','type-member-origins','callable-declarations'")}
CREATE TABLE inventory_callable_declaration(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,origin INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('resolved','unresolved')),declaration INTEGER,body INTEGER,reason TEXT,detail TEXT,refusalNode INTEGER,traceCount INTEGER NOT NULL CHECK(traceCount>=0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,origin) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,declaration) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,body) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,refusalNode) REFERENCES inventory_span(partition,ordinal),CHECK((state='resolved' AND declaration IS NOT NULL AND reason IS NULL AND detail IS NULL AND refusalNode IS NULL) OR (state='unresolved' AND declaration IS NULL AND body IS NULL AND reason IS NOT NULL AND detail IS NOT NULL AND refusalNode IS NOT NULL))) STRICT;
CREATE TABLE inventory_callable_trace(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,ordinal INTEGER NOT NULL,node INTEGER NOT NULL,PRIMARY KEY(partition,owner,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_callable_declaration(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;
const FORMAT12_DDL = `${FORMAT11_DDL.replace("'type-member-origins','callable-declarations'", "'type-member-origins','callable-declarations','computed-names'")}
CREATE TABLE inventory_computed_name(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,origin INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('resolved','unresolved')),value TEXT,reason TEXT,detail TEXT,refusalNode INTEGER,traceCount INTEGER NOT NULL CHECK(traceCount>=0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,origin) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,refusalNode) REFERENCES inventory_span(partition,ordinal),CHECK((state='resolved' AND value IS NOT NULL AND reason IS NULL AND detail IS NULL AND refusalNode IS NULL) OR (state='unresolved' AND value IS NULL AND reason IS NOT NULL AND detail IS NOT NULL AND refusalNode IS NOT NULL))) STRICT;
CREATE TABLE inventory_computed_trace(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,ordinal INTEGER NOT NULL,node INTEGER NOT NULL,PRIMARY KEY(partition,owner,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_computed_name(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;

const FORMAT13_DDL = `${FORMAT12_DDL.replace("'callable-declarations','computed-names'", "'callable-declarations','computed-names','global-origins'")}
CREATE TABLE inventory_global_origin(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,origin INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('resolved','unresolved')),name TEXT,reason TEXT,detail TEXT,refusalNode INTEGER,valueCount INTEGER NOT NULL CHECK(valueCount>=0),traceCount INTEGER NOT NULL CHECK(traceCount>=0),memberCount INTEGER NOT NULL CHECK(memberCount>=0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,origin) REFERENCES inventory_span(partition,ordinal),FOREIGN KEY(partition,refusalNode) REFERENCES inventory_span(partition,ordinal),CHECK((state='resolved' AND name IS NOT NULL AND reason IS NULL AND detail IS NULL AND refusalNode IS NULL) OR (state='unresolved' AND name IS NULL AND reason IS NOT NULL AND detail IS NOT NULL AND refusalNode IS NOT NULL AND valueCount=0 AND memberCount=0))) STRICT;
CREATE TABLE inventory_global_declaration(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,role TEXT NOT NULL CHECK(role IN ('value','trace')),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,PRIMARY KEY(partition,owner,role,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_global_origin(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;
CREATE TABLE inventory_global_member(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,ordinal INTEGER NOT NULL,name TEXT NOT NULL,PRIMARY KEY(partition,owner,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_global_origin(partition,ordinal)) STRICT;
CREATE TABLE inventory_global_binding(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,lexicalCount INTEGER NOT NULL CHECK(lexicalCount>=0),originCount INTEGER NOT NULL CHECK(originCount>=0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,node),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;

const FORMAT14_DDL = `${FORMAT13_DDL.replace("'computed-names','global-origins'", "'computed-names','global-origins','invocation-evidence'")}
CREATE TABLE inventory_invocation_evidence(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,node INTEGER NOT NULL,key TEXT NOT NULL,atomCount INTEGER NOT NULL CHECK(atomCount>0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,key),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;
CREATE TABLE inventory_invocation_atom(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,ordinal INTEGER NOT NULL,parent INTEGER,key TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('object','array','string','number','boolean','null')),text TEXT,number REAL,size INTEGER NOT NULL CHECK(size>=0),PRIMARY KEY(partition,owner,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_invocation_evidence(partition,ordinal),FOREIGN KEY(partition,owner,parent) REFERENCES inventory_invocation_atom(partition,owner,ordinal)) STRICT;
CREATE TABLE inventory_invocation_source(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,ordinal INTEGER NOT NULL,file TEXT NOT NULL,bindingCount INTEGER NOT NULL CHECK(bindingCount>=0),PRIMARY KEY(partition,owner,ordinal),UNIQUE(partition,owner,file),FOREIGN KEY(partition,owner) REFERENCES inventory_invocation_evidence(partition,ordinal)) STRICT;`;

const EXPORT_SCHEMA_DDL = `${FORMAT14_DDL.replace("'exports','modules'", "'exports','export-declarations','modules'")}
CREATE TABLE inventory_export_declaration(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,file TEXT NOT NULL,name TEXT NOT NULL,present INTEGER NOT NULL CHECK(present IN (0,1)),declarationCount INTEGER NOT NULL CHECK(declarationCount>=0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,file,name),CHECK(present=1 OR declarationCount=0)) STRICT;
CREATE TABLE inventory_export_declaration_node(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,ordinal INTEGER NOT NULL,node INTEGER NOT NULL,PRIMARY KEY(partition,owner,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_export_declaration(partition,ordinal),FOREIGN KEY(partition,node) REFERENCES inventory_span(partition,ordinal)) STRICT;`;

const REFERENCE_PRIOR_DDL = `${EXPORT_SCHEMA_DDL}
CREATE TABLE inventory_drizzle_evidence(partition TEXT NOT NULL REFERENCES inventory_partition(id),ordinal INTEGER NOT NULL,key TEXT NOT NULL,atomCount INTEGER NOT NULL CHECK(atomCount>0),PRIMARY KEY(partition,ordinal),UNIQUE(partition,key)) STRICT;
CREATE TABLE inventory_drizzle_atom(partition TEXT NOT NULL REFERENCES inventory_partition(id),owner INTEGER NOT NULL,ordinal INTEGER NOT NULL,parent INTEGER,key TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('object','array','string','number','boolean','null')),text TEXT,number REAL,size INTEGER NOT NULL CHECK(size>=0),PRIMARY KEY(partition,owner,ordinal),FOREIGN KEY(partition,owner) REFERENCES inventory_drizzle_evidence(partition,ordinal),FOREIGN KEY(partition,owner,parent) REFERENCES inventory_drizzle_atom(partition,owner,ordinal)) STRICT;`;

function legacyRows(db: DatabaseSync): ReturnType<StatementSync["all"]>[] {
  return [
    db.prepare("SELECT * FROM inventory_partition WHERE id=?").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_generation WHERE id=1").all(),
    db.prepare("SELECT * FROM inventory_member WHERE generation=1").all(),
    db.prepare("SELECT partition,program,descriptorVersion,compilerOptionsJson,workerPid FROM inventory_descriptor WHERE partition=?").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_family WHERE partition=? ORDER BY ordinal").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_input WHERE partition=? ORDER BY ordinal").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_source WHERE partition=? ORDER BY ordinal").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_text WHERE partition=? ORDER BY source,ordinal").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_span WHERE partition=? ORDER BY ordinal").all(LEGACY_PARTITION),
    db.prepare("SELECT * FROM inventory_cast WHERE partition=? ORDER BY ordinal").all(LEGACY_PARTITION),
  ];
}

function createPriorStorage(path: string, version: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12): ReturnType<typeof legacyRows> {
  mkdirSync(dirname(path), { recursive: true });
  using db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  db.exec(
    (
      [
        FORMAT4_DDL,
        FORMAT5_DDL,
        FORMAT6_DDL,
        FORMAT7_DDL,
        FORMAT8_DDL,
        FORMAT9_DDL,
        FORMAT10_DDL,
        FORMAT11_DDL,
        FORMAT12_DDL,
        FORMAT13_DDL,
        FORMAT14_DDL,
        EXPORT_SCHEMA_DDL,
        REFERENCE_PRIOR_DDL,
      ] as const
    )[version],
  );
  db.exec(`PRAGMA user_version=${String(version)}`);
  const program = inventoryString("tsconfig.legacy.json");
  const file = inventoryString("/fixture/legacy.ts");
  const text = "export const legacy=1 as number;";
  db.prepare("INSERT INTO inventory_partition(id,program,format,payload) VALUES(?,?,?,?)").run(
    LEGACY_PARTITION,
    program,
    priorFormat(version),
    "retained payload",
  );
  db.prepare("INSERT INTO inventory_generation(id,format) VALUES(1,?)").run(priorFormat(version));
  db.prepare("INSERT INTO inventory_member(generation,program,partition) VALUES(1,?,?)").run(program, LEGACY_PARTITION);
  db.prepare("INSERT INTO inventory_descriptor(partition,program,descriptorVersion,compilerOptionsJson,workerPid) VALUES(?,?,?,?,NULL)").run(
    LEGACY_PARTITION,
    program,
    inventoryString("legacy-version"),
    inventoryString("{}"),
  );
  db.prepare("INSERT INTO inventory_family(partition,ordinal,name) VALUES(?,0,'exports'),(?,1,'cast-relations')").run(LEGACY_PARTITION, LEGACY_PARTITION);
  // Format 5 introduced the now-retired id-brands tag; every rebuilt family table must still admit its historical rows.
  if (version > 0) {
    db.prepare("INSERT INTO inventory_family(partition,ordinal,name) VALUES(?,2,'id-brands')").run(LEGACY_PARTITION);
  }
  db.prepare("INSERT INTO inventory_input(partition,ordinal,path,kind,version) VALUES(?,3,?,'file',?),(?,7,?,'exists',?)").run(
    LEGACY_PARTITION,
    file,
    inventoryString("old-file-version"),
    LEGACY_PARTITION,
    inventoryString("/fixture/negative\ud800"),
    inventoryString("false"),
  );
  db.prepare(
    "INSERT INTO inventory_source(partition,ordinal,file,path,consumerClass,authored,textVersion,textLength,textParts) VALUES(?,0,?,?,'product',1,?,?,1)",
  ).run(LEGACY_PARTITION, file, file, inventoryTextVersion(inventoryTextParts(text)), text.length);
  db.prepare("INSERT INTO inventory_text(partition,source,ordinal,value) VALUES(?,0,0,?)").run(LEGACY_PARTITION, inventoryString(text));
  db.prepare("INSERT INTO inventory_span(partition,ordinal,file,start,end,kind) VALUES(?,0,?,?,?,?)").run(
    LEGACY_PARTITION,
    file,
    text.indexOf("1 as number"),
    text.length - 1,
    SyntaxKind.AsExpression,
  );
  db.prepare("INSERT INTO inventory_cast(partition,ordinal,node,leftToRight,rightToLeft,leftIsAny,rightIsAny,reason) VALUES(?,0,0,1,0,0,0,NULL)").run(
    LEGACY_PARTITION,
  );
  return legacyRows(db);
}

function priorFormat(version: number): number {
  if (version === 12) {
    return 19;
  }
  return version === 11 ? 14 : 4 + version;
}

function brandPartition(program: string): InventoryPartition {
  const file = "/fixture/packages/kit/src/ids/index.ts";
  const text = 'declare const brand:unique symbol; export type Current=string & {readonly [brand]:"chat"};';
  return {
    intent: "facts",
    available: [file],
    shapes: [{ node: { file, start: 0, end: text.length, kind: SyntaxKind.SourceFile }, copy: [], respell: [], direct: ["origin"], queries: [] }],
    pairs: [
      {
        query: {
          left: { file, start: 0, end: text.length, kind: SyntaxKind.SourceFile },
          right: { file, start: 0, end: text.length, kind: SyntaxKind.SourceFile },
          leftField: null,
          rightField: null,
          projection: "mutual",
          lenient: false,
        },
        result: { kind: "answer", values: [true] },
      },
    ],
    format: INVENTORY_FORMAT,
    families: [
      "export-declarations",
      "runtime-exports",
      "shape-catalog",
      "shape-pairs",
      "declaration-outputs",
      "type-member-origins",
      "callable-declarations",
      "computed-names",
      "global-origins",
    ],
    program,
    descriptorVersion: "current-version",
    compilerOptionsJson: "{}",
    configPaths: [],
    projectReferences: [],
    roots: [file],
    nativeRoots: [file],
    inputs: [
      { path: file, kind: "authored", version: "true" },
      { path: `${file}.external`, kind: "authored", version: "false" },
    ],
    sources: [{ file, path: file, text, consumerClass: "product", authored: true }],
    memberOrigins: [],
    callableDeclarations: [],
    computedNames: [],
    globalOrigins: [],
    globalBindings: [],
    invocationEvidence: [],
    declarationOutputs: [{ node: { file, start: 0, end: text.length, kind: SyntaxKind.SourceFile }, unknown: false }],
    runtimeExports: [
      {
        file,
        name: "Current",
        declaration: { file, start: text.indexOf("export type"), end: text.length, kind: SyntaxKind.TypeAliasDeclaration },
        callable: false,
        initializer: null,
      },
    ],
    exportDeclarations: [
      {
        query: { file, name: "Current" },
        declarations: [{ file, start: text.indexOf("export type"), end: text.length, kind: SyntaxKind.TypeAliasDeclaration }],
      },
      { query: { file, name: "Absent" }, declarations: null },
    ],
    exports: [],
    modules: [],
    bindings: [],
    references: [],
    witnesses: [],
  };
}

function familyDdl(db: DatabaseSync): ReturnType<StatementSync["get"]> {
  return db.prepare("SELECT sql FROM sqlite_schema WHERE name='inventory_family'").get();
}

test("retired cast facts remain historical rows but cannot become current demand or a current partition", ({ scratch }) => {
  const path = join(scratch, "retired-casts.sqlite");
  const before = createPriorStorage(path, 0);
  using pinned = new DatabaseSync(path, { readOnly: true });
  pinned.exec("BEGIN");
  expect(legacyRows(pinned)).toEqual(before);
  using current = openInventoryDatabase(path);
  expect(
    current.prepare("SELECT node,leftToRight,rightToLeft,leftIsAny,rightIsAny,reason FROM inventory_cast WHERE partition=?").all(LEGACY_PARTITION),
  ).toEqual([{ node: 0, leftToRight: 1, rightToLeft: 0, leftIsAny: 0, rightIsAny: 0, reason: null }]);
  expect(legacyRows(current)).toEqual(before);
  expect(legacyRows(pinned)).toEqual(before);
  expect(() => readInventoryGeneration(current, 1)).toThrow();
  pinned.exec("ROLLBACK");
  using reopened = openInventoryDatabase(path);
  expect(legacyRows(reopened)).toEqual(before);
  expect(() => inventoryFamilies(["cast-relations"])).toThrow();
});

test("metadata decoding rejects malformed JSON and encoded non-string values", ({ scratch }) => {
  using db = openInventoryDatabase(join(scratch, "metadata.sqlite"));
  const generation = publishInventoryGeneration(db, [brandPartition("tsconfig.metadata.json")]);
  const before = readInventoryGeneration(db, generation);
  const partition = before[0];
  if (partition === undefined) {
    throw new Error("metadata decoding partition missing");
  }
  const change = db.prepare("UPDATE inventory_descriptor SET descriptorVersion=? WHERE partition=?");
  for (const encoded of ["{", "null", "0", "false", "[]", "{}"] as const) {
    change.run(encoded, partition.id);
    expect(() => readInventoryGeneration(db, generation)).toThrow(encoded === "{" ? SyntaxError : "expected string");
  }
  change.run(inventoryString(partition.descriptorVersion), partition.id);
  expect(readInventoryGeneration(db, generation)).toEqual(before);
});

function inputDdl(db: DatabaseSync): ReturnType<StatementSync["get"]> {
  return db.prepare("SELECT sql FROM sqlite_schema WHERE name='inventory_input'").get();
}

// Schemas 13 and 14 have no current DDL snapshot: each is today's store minus the tables its successors added.
test.for([13, 14] as const)("schema %s upgrade adds name-link storage, keeps old facts and pinned readers, and round-trips links", (version, { scratch }) => {
  const path = join(scratch, "reference-name-upgrade.sqlite");
  const before = createPriorStorage(path, 12);
  {
    using upgraded = openInventoryDatabase(path);
    upgraded.exec("DROP INDEX inventory_reference_name_lookup; DROP TABLE inventory_reference_name;");
    if (version === 13) {
      upgraded.exec("DROP TABLE inventory_runtime_resolution; DROP TABLE inventory_runtime_source; DROP TABLE inventory_runtime_header;");
    }
    upgraded.exec(`PRAGMA user_version=${String(version)}`);
  }
  const nameStorage = "SELECT name FROM sqlite_schema WHERE name LIKE 'inventory_reference_name%' ORDER BY name";
  using pinned = new DatabaseSync(path, { readOnly: true });
  pinned.exec("BEGIN");
  expect(pinned.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: version });
  expect(pinned.prepare(nameStorage).all()).toEqual([]);
  expect(legacyRows(pinned)).toEqual(before);
  using current = openInventoryDatabase(path);
  expect(current.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 15 });
  expect(current.prepare(nameStorage).all()).toEqual([{ name: "inventory_reference_name" }, { name: "inventory_reference_name_lookup" }]);
  expect(legacyRows(current)).toEqual(before);
  expect(legacyRows(pinned)).toEqual(before);
  expect(pinned.prepare(nameStorage).all()).toEqual([]);
  pinned.exec("ROLLBACK");
  const facts = brandPartition("tsconfig.names.json");
  const file = facts.sources[0]?.file ?? "";
  const declaration = { file, start: 0, end: 4, kind: SyntaxKind.TypeAliasDeclaration };
  const name = { file, start: 0, end: 1, kind: SyntaxKind.Identifier };
  const reference = { file, start: 2, end: 3, kind: SyntaxKind.Identifier };
  const references = [
    { declaration, reference, consumerClass: "product" as const },
    { declaration: name, reference, consumerClass: "product" as const },
  ];
  current.exec("BEGIN IMMEDIATE");
  const generation = publishInventoryGeneration(current, [
    { ...facts, families: [...facts.families, "references"], referenceMode: "complete", references, referenceNames: [{ name, declaration }] },
  ]);
  current.exec("COMMIT");
  const stored = readInventoryGeneration(current, generation)[0];
  if (stored === undefined) {
    throw new Error("upgraded name-link partition missing");
  }
  expect([...readInventoryReferences(current, stored.id)]).toEqual(references);
  expect([...readInventoryReferences(current, stored.id, name)]).toEqual([references[1]]);
  const rows = (table: string): unknown => current.prepare(`SELECT COUNT(*) AS rows FROM ${table} WHERE partition=?`).get(stored.id)?.["rows"];
  expect([rows("inventory_reference"), rows("inventory_reference_name")]).toEqual([1, 1]);
  expect(legacyRows(current)).toEqual(before);
  expect(current.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

test("reference name links store one copy and replay the exact logical stream", ({ scratch }) => {
  const facts = brandPartition("tsconfig.names-stream.json");
  const native: InventoryPartition = { ...facts, families: [...facts.families, "references"], referenceMode: "complete" };
  const file = native.sources[0]?.file;
  if (file === undefined) {
    throw new Error("native reference-name fixture source missing");
  }
  const span = (start: number, kind: number): InventoryPartition["references"][number]["declaration"] => ({ file, start, end: start + 1, kind });
  const declarations = [
    span(0, SyntaxKind.VariableDeclaration),
    span(2, SyntaxKind.Parameter),
    span(4, SyntaxKind.PropertySignature),
    span(6, SyntaxKind.PropertyAssignment),
  ];
  const [repeated, empty, shared, sharedTwin] = declarations;
  const names = [span(0, SyntaxKind.Identifier), span(2, SyntaxKind.Identifier), span(4, SyntaxKind.Identifier)];
  const [repeatedName, emptyName, sharedName] = names;
  const unnamed = span(8, SyntaxKind.FunctionDeclaration);
  if ([repeated, empty, shared, sharedTwin, repeatedName, emptyName, sharedName].includes(undefined)) {
    throw new Error("native reference-name fixture spans missing");
  }
  const rows = (declaration: InventoryPartition["references"][number]["declaration"], targets: readonly number[]): InventoryPartition["references"] =>
    targets.map((start, index) => ({
      declaration,
      reference: span(start, SyntaxKind.Identifier),
      consumerClass: index % 2 === 0 ? ("product" as const) : ("test" as const),
    }));
  const at = <T>(value: T | undefined): T => {
    if (value === undefined) {
      throw new Error("native reference-name fixture value missing");
    }
    return value;
  };
  // Native repeats (11 twice) stay; a nameless declaration interleaves; one name links two declarations.
  native.references = [
    ...rows(at(repeated), [10, 11, 11]),
    ...rows(at(repeatedName), [10, 11, 11]),
    ...rows(unnamed, [12]),
    ...rows(at(shared), [13]),
    ...rows(at(sharedName), [13]),
    ...rows(at(sharedTwin), [14, 15]),
    ...rows(at(sharedName), [14, 15]),
  ];
  native.referenceNames = [
    { name: at(repeatedName), declaration: at(repeated) },
    { name: at(emptyName), declaration: at(empty) },
    { name: at(sharedName), declaration: at(shared) },
    { name: at(sharedName), declaration: at(sharedTwin) },
  ];
  using database = openInventoryDatabase(join(scratch, "names.sqlite"));
  database.exec("BEGIN IMMEDIATE");
  const generation = publishInventoryGeneration(database, [native]);
  database.exec("COMMIT");
  const stored = readInventoryGeneration(database, generation)[0];
  if (stored === undefined) {
    throw new Error("native reference-name partition missing");
  }
  expect([...readInventoryReferences(database, stored.id)]).toStrictEqual(native.references);
  for (const origin of [...declarations, ...names, unnamed, span(9, SyntaxKind.Identifier)]) {
    const key = JSON.stringify(origin);
    expect([...readInventoryReferences(database, stored.id, origin)], key).toStrictEqual(
      native.references.filter((row) => JSON.stringify(row.declaration) === key),
    );
  }
  const count = (table: string): unknown => database.prepare(`SELECT COUNT(*) AS rows FROM ${table} WHERE partition=?`).get(stored.id)?.["rows"];
  expect(count("inventory_reference")).toBe(7);
  expect(count("inventory_reference_name")).toBe(4);
  const refused = [
    { change: "differ", references: native.references.map((row, index) => (index === 4 ? { ...row, consumerClass: "product" as const } : row)) },
    { change: "missing", references: native.references.filter((row) => JSON.stringify(row.declaration) !== JSON.stringify(repeatedName)) },
  ];
  for (const { change, references } of refused) {
    using rejecting = openInventoryDatabase(join(scratch, `names-${change}.sqlite`));
    rejecting.exec("BEGIN IMMEDIATE");
    expect(() => publishInventoryGeneration(rejecting, [{ ...native, references }])).toThrow(change);
    rejecting.exec("ROLLBACK");
  }
});

const SOURCE_LOOKUP = "SELECT ordinal,file,path,consumerClass,authored,textVersion,textLength,textParts FROM inventory_source WHERE partition=? AND file=?";

test.for([11, 12] as const)("source-file lookup upgrades physical schema %s without replacing old rows or blocking indexed readers", (version, { scratch }) => {
  const path = join(scratch, "source-lookup.sqlite");
  const before = createPriorStorage(path, 11);
  if (version === 12) {
    using existing = openInventoryDatabase(path);
    existing.exec("DROP INDEX IF EXISTS inventory_source_file");
  }
  using pinned = new DatabaseSync(path, { readOnly: true });
  pinned.exec("BEGIN");
  expect(legacyRows(pinned)).toEqual(before);
  using current = openInventoryDatabase(path);
  const details = current.prepare(`EXPLAIN QUERY PLAN ${SOURCE_LOOKUP}`).all(LEGACY_PARTITION, inventoryString("/fixture/legacy.ts"));
  expect(details.map((row) => row["detail"])).toContain("SEARCH inventory_source USING INDEX inventory_source_file (partition=? AND file=?)");
  expect(current.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 15 });
  expect(legacyRows(current)).toEqual(before);
  expect(legacyRows(pinned)).toEqual(before);
  expect(pinned.prepare("SELECT name FROM sqlite_schema WHERE name='inventory_source_file'").get()).toBeUndefined();
  beginInventoryWrite(current);
  const execute = DatabaseSync.prototype.exec;
  const readerLock = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
    if (sql === "BEGIN IMMEDIATE") {
      throw new Error("indexed current-schema reader attempted a writer lock");
    }
    execute.call(this, sql);
  });
  try {
    using reader = openInventoryDatabase(path);
    expect(legacyRows(reader)).toEqual(before);
  } finally {
    readerLock.mockRestore();
    current.exec("ROLLBACK");
    pinned.exec("ROLLBACK");
  }
});

test("source-file lookup remains nonunique and preserves public missing/duplicate ownership refusals", ({ scratch }) => {
  using db = openInventoryDatabase(join(scratch, "ownership.sqlite"));
  const base = brandPartition("tsconfig.lookup.json");
  beginInventoryWrite(db);
  const generation = publishInventoryGeneration(db, [{ ...base, families: [...base.families, "bindings"] }]);
  db.exec("COMMIT");
  const partition = readInventoryGeneration(db, generation)[0];
  const file = base.sources[0];
  if (partition === undefined || file === undefined) {
    throw new Error("source ownership control is missing");
  }
  const node = { file: file.file, start: 0, end: file.text.length, kind: SyntaxKind.SourceFile };
  expect(
    db
      .prepare("PRAGMA index_list(inventory_source)")
      .all()
      .find((row) => row["name"] === "inventory_source_file"),
  ).toMatchObject({ unique: 0 });
  expect([...readInventoryBindings(db, partition.id, node)]).toEqual([]);
  for (const sql of [
    "INSERT INTO inventory_source(partition,ordinal,file,path,consumerClass,authored,textVersion,textLength,textParts) SELECT partition,ordinal+1,file,path,consumerClass,authored,textVersion,textLength,textParts FROM inventory_source WHERE partition=?",
    "DELETE FROM inventory_source WHERE partition=?",
  ]) {
    db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
    try {
      db.prepare(sql).run(partition.id);
      expect(() => [...readInventoryBindings(db, partition.id, node)]).toThrow("binding source ownership is unavailable");
    } finally {
      db.exec("ROLLBACK");
    }
  }
  expect([...readInventoryBindings(db, partition.id, node)]).toEqual([]);
});

test.for([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const)(
  "physical schema %s accepts current authored inputs and brands while old reader snapshots and identities survive",
  (version, { scratch }) => {
    const path = join(scratch, "old.sqlite");
    const before = createPriorStorage(path, version);
    const facts = brandPartition("tsconfig.direct.json");
    using fresh = openInventoryDatabase(join(scratch, "fresh.sqlite"));
    beginInventoryWrite(fresh);
    const freshGeneration = publishInventoryGeneration(fresh, [facts]);
    fresh.exec("COMMIT");
    const freshId = readInventoryGeneration(fresh, freshGeneration)[0]?.id;
    expect(freshId).toBeDefined();
    using pinned = new DatabaseSync(path, { readOnly: true });
    pinned.exec("BEGIN");
    const oldDdl = familyDdl(pinned);
    const oldInputDdl = inputDdl(pinned);
    expect(legacyRows(pinned)).toEqual(before);
    using current = openInventoryDatabase(path);
    try {
      beginInventoryWrite(current);
      const generation = publishInventoryGeneration(current, [facts]);
      current.exec("COMMIT");
      const direct = readInventoryGeneration(current, generation)[0];
      expect(direct?.id).toBe(freshId);
      expect(current.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 15 });
      expect(legacyRows(current)).toEqual(before);
      expect(legacyRows(pinned)).toEqual(before);
      expect(familyDdl(pinned)).toEqual(oldDdl);
      expect(inputDdl(pinned)).toEqual(oldInputDdl);
      expect(pinned.prepare("SELECT id,format FROM inventory_generation ORDER BY id").all()).toEqual([{ id: 1, format: priorFormat(version) }]);
      const stagePath = join(scratch, "stage.sqlite");
      using staging = openInventoryDatabase(stagePath);
      beginInventoryWrite(staging);
      const stageGeneration = publishInventoryGeneration(staging, [brandPartition("tsconfig.imported.json")]);
      staging.exec("COMMIT");
      const imported = readInventoryGeneration(staging, stageGeneration)[0];
      if (imported === undefined) {
        throw new Error("missing staged brand partition");
      }
      expect(imported.id).not.toBe(freshId);
      beginInventoryWrite(current);
      const execute = DatabaseSync.prototype.exec;
      const readerLock = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
        if (sql === "BEGIN IMMEDIATE") {
          throw new Error("current-schema reader attempted a writer lock");
        }
        execute.call(this, sql);
      });
      try {
        using reader = openInventoryDatabase(path);
        expect(legacyRows(reader)).toEqual(before);
        expect(reader.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 15 });
      } finally {
        readerLock.mockRestore();
      }
      importInventoryPartition(current, stagePath, imported.id);
      const importedGeneration = publishInventoryGeneration(current, [imported]);
      current.exec("COMMIT");
      expect(readInventoryGeneration(current, importedGeneration)[0]?.id).toBe(imported.id);
      for (const capture of facts.exportDeclarations ?? []) {
        expect([...readInventoryExportDeclarations(current, imported.id, capture.query)]).toEqual([capture]);
      }
      expect([...readInventoryInputs(current, imported.id)]).toEqual(facts.inputs);
      const output = facts.declarationOutputs[0];
      if (output === undefined) {
        throw new Error("missing fixture declaration output");
      }
      expect([...readInventoryDeclarationOutputs(current, imported.id, output.node)]).toEqual(facts.declarationOutputs);
      expect([...readInventoryRuntimeExports(current, imported.id, facts.roots[0] ?? "")]).toEqual(facts.runtimeExports);
      expect([...readInventoryPairs(current, imported.id)]).toEqual(facts.pairs);
      const shape = facts.shapes[0];
      if (shape === undefined) {
        throw new Error("missing fixture shape");
      }
      expect(readInventoryShape(current, imported.id, shape.node)).toEqual(shape);
      expect(current.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(legacyRows(current)).toEqual(before);
      expect(pinned.prepare("SELECT id,format FROM inventory_generation ORDER BY id").all()).toEqual([{ id: 1, format: priorFormat(version) }]);
      pinned.exec("COMMIT");
      expect(pinned.prepare("SELECT id,format FROM inventory_generation ORDER BY id").all()).toEqual([
        { id: 1, format: priorFormat(version) },
        { id: 2, format: INVENTORY_FORMAT },
        { id: 3, format: INVENTORY_FORMAT },
      ]);
      using reopened = openInventoryDatabase(path);
      expect(familyDdl(reopened)).toEqual(familyDdl(current));
      expect(inputDdl(reopened)).toEqual(inputDdl(current));
      expect(legacyRows(reopened)).toEqual(before);
      expect(reopened.prepare("SELECT name FROM sqlite_schema WHERE name IN ('inventory_family_upgrade','inventory_input_upgrade')").all()).toEqual([]);
    } finally {
      if (current.isTransaction) {
        current.exec("ROLLBACK");
      }
      if (pinned.isTransaction) {
        pinned.exec("ROLLBACK");
      }
    }
  },
);

test.for([
  { version: 0, table: "family" },
  { version: 0, table: "input" },
  { version: 1, table: "input" },
  { version: 2, table: "family" },
  { version: 3, table: "list" },
  { version: 4, table: "family" },
  { version: 5, table: "family" },
  { version: 6, table: "family" },
  { version: 7, table: "family" },
  { version: 8, table: "family" },
  { version: 9, table: "family" },
  { version: 10, table: "family" },
  { version: 11, table: "family" },
] as const)("post-drop failure rolls back physical schema and rows: %j", ({ version, table }, { scratch }) => {
  const path = join(scratch, "rollback.sqlite");
  const before = createPriorStorage(path, version);
  using observer = new DatabaseSync(path, { readOnly: true });
  const oldDdl = familyDdl(observer);
  const oldInputDdl = inputDdl(observer);
  const oldTables = observer.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  const execute = DatabaseSync.prototype.exec;
  let dropped = false;
  const rename = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
    if (sql.startsWith(`ALTER TABLE inventory_${table}_upgrade RENAME`)) {
      dropped = this.prepare("SELECT name FROM sqlite_schema WHERE name=?").get(`inventory_${table}`) === undefined;
      throw new Error("post-drop rename failure");
    }
    execute.call(this, sql);
  });
  try {
    expect(() => openInventoryDatabase(path)).toThrow("post-drop rename failure");
  } finally {
    rename.mockRestore();
  }
  expect(dropped).toBe(true);
  expect(legacyRows(observer)).toEqual(before);
  expect(familyDdl(observer)).toEqual(oldDdl);
  expect(inputDdl(observer)).toEqual(oldInputDdl);
  expect(observer.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: version });
  expect(observer.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()).toEqual(oldTables);
  expect(observer.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  using retried = openInventoryDatabase(path);
  expect(retried.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 15 });
  expect(legacyRows(retried)).toEqual(before);
});

test.for([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const)("competing physical upgrades preserve schema %s rows and converge", async (version, { scratch }) => {
  const path = join(scratch, "racing.sqlite");
  const before = createPriorStorage(path, version);
  const module = import.meta.resolve("@orb/tooling/floor/code-facts/semantic-inventory-database");
  const script = `import {openInventoryDatabase} from ${JSON.stringify(module)}; using db=openInventoryDatabase(${JSON.stringify(path)}); console.log(JSON.stringify(db.prepare("PRAGMA user_version").get()));`;
  const results = await Promise.all([
    spawnNiced(process.execPath, ["--input-type=module", "-e", script], { cwd: scratch }),
    spawnNiced(process.execPath, ["--input-type=module", "-e", script], { cwd: scratch }),
  ]);
  expect(
    results.map(({ code }) => code),
    JSON.stringify(results),
  ).toEqual([0, 0]);
  expect(results.map(({ stdout }) => JSON.parse(stdout))).toEqual([{ ["user_version"]: 15 }, { ["user_version"]: 15 }]);
  using db = openInventoryDatabase(path);
  expect(legacyRows(db)).toEqual(before);
  expect(db.prepare("SELECT name FROM sqlite_schema WHERE name IN ('inventory_family_upgrade','inventory_input_upgrade')").all()).toEqual([]);
});

test("an unsupported future physical schema is refused rather than downgraded", ({ scratch }) => {
  const path = join(scratch, "future.sqlite");
  const before = createPriorStorage(path, 0);
  using db = new DatabaseSync(path);
  db.exec("PRAGMA user_version=16");
  const oldDdl = familyDdl(db);
  expect(() => openInventoryDatabase(path)).toThrow("unsupported native inventory storage schema: 16");
  expect(db.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 16 });
  expect(familyDdl(db)).toEqual(oldDdl);
  expect(legacyRows(db)).toEqual(before);
});

const LIST_LOOKUP = "SELECT ordinal FROM inventory_list WHERE partition=? AND kind='available' AND value=?";
test.for([11, 12] as const)(
  "list-value lookup upgrades physical schema %s with complete populated rows and reader snapshots intact",
  (version, { scratch }) => {
    const path = join(scratch, "list-lookup.sqlite");
    createPriorStorage(path, 11);
    {
      using seed = new DatabaseSync(path);
      seed.exec("BEGIN IMMEDIATE");
      const source = seed.prepare(
        "INSERT INTO inventory_source SELECT partition,?, ?,?,consumerClass,authored,textVersion,textLength,textParts FROM inventory_source WHERE partition=? AND ordinal=0",
      );
      const text = seed.prepare("INSERT INTO inventory_text SELECT partition,?,ordinal,value FROM inventory_text WHERE partition=? AND source=0");
      const available = seed.prepare("INSERT INTO inventory_list(partition,kind,ordinal,value) VALUES(?,'available',?,?)");
      for (let ordinal = 0; ordinal < 1024; ordinal++) {
        const file = inventoryString(`/fixture/library-${String(ordinal)}.ts`);
        source.run(ordinal + 1, file, file, LEGACY_PARTITION);
        text.run(ordinal + 1, LEGACY_PARTITION);
        available.run(LEGACY_PARTITION, ordinal, file);
      }
      seed.exec("COMMIT");
    }
    if (version === 12) {
      using existing = openInventoryDatabase(path);
      existing.exec("DROP INDEX IF EXISTS inventory_list_value");
    }
    using pinned = new DatabaseSync(path, { readOnly: true });
    pinned.exec("BEGIN");
    const before = legacyRows(pinned);
    const rows = pinned.prepare("SELECT * FROM inventory_list ORDER BY partition,kind,ordinal").all();
    expect(rows).toHaveLength(1024);
    using current = openInventoryDatabase(path);
    const details = current.prepare(`EXPLAIN QUERY PLAN ${LIST_LOOKUP}`).all(LEGACY_PARTITION, inventoryString("/fixture/library-1023.ts"));
    expect(details.map((row) => row["detail"])).toContain("SEARCH inventory_list USING INDEX inventory_list_value (partition=? AND kind=? AND value=?)");
    expect(current.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 15 });
    expect(legacyRows(current)).toEqual(before);
    expect(legacyRows(pinned)).toEqual(before);
    expect(current.prepare("SELECT * FROM inventory_list ORDER BY partition,kind,ordinal").all()).toEqual(rows);
    expect(pinned.prepare("SELECT name FROM sqlite_schema WHERE name='inventory_list_value'").get()).toBeUndefined();
    beginInventoryWrite(current);
    const execute = DatabaseSync.prototype.exec;
    const lock = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
      if (sql === "BEGIN IMMEDIATE") {
        throw new Error("indexed list reader attempted a writer lock");
      }
      execute.call(this, sql);
    });
    try {
      using ready = openInventoryDatabase(path);
      expect(ready.prepare("SELECT * FROM inventory_list ORDER BY partition,kind,ordinal").all()).toEqual(rows);
      expect(legacyRows(ready)).toEqual(before);
    } finally {
      lock.mockRestore();
      current.exec("ROLLBACK");
      pinned.exec("ROLLBACK");
    }
  },
);

test("list-value lookup preserves duplicate membership, explicit list order and public missing-closure refusal", ({ scratch }) => {
  using db = openInventoryDatabase(join(scratch, "membership.sqlite"));
  const facts = brandPartition("tsconfig.list.json");
  beginInventoryWrite(db);
  const generation = publishInventoryGeneration(db, [facts]);
  db.exec("COMMIT");
  const partition = readInventoryGeneration(db, generation)[0];
  const capture = facts.exportDeclarations?.[0];
  if (partition === undefined || capture === undefined) {
    throw new Error("list membership fixture is missing");
  }
  const before = readInventoryGeneration(db, generation);
  expect(
    db
      .prepare("PRAGMA index_list(inventory_list)")
      .all()
      .find((row) => row["name"] === "inventory_list_value"),
  ).toMatchObject({ unique: 0 });
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO inventory_list(partition,kind,ordinal,value) VALUES(?,'available',1,?)").run(partition.id, inventoryString(capture.query.file));
    expect(db.prepare(LIST_LOOKUP + " ORDER BY ordinal").all(partition.id, inventoryString(capture.query.file))).toEqual([{ ordinal: 0 }, { ordinal: 1 }]);
    expect([...readInventoryExportDeclarations(db, partition.id, capture.query)]).toEqual([capture]);
    expect(db.prepare(LIST_LOOKUP).get(partition.id, inventoryString("/fixture/missing.ts"))).toBeUndefined();
    db.prepare("DELETE FROM inventory_list WHERE partition=? AND kind='available'").run(partition.id);
    expect(() => [...readInventoryExportDeclarations(db, partition.id, capture.query)]).toThrow("outside its native closure");
  } finally {
    db.exec("ROLLBACK");
  }
  expect(readInventoryGeneration(db, generation)).toEqual(before);
  expect([...readInventoryExportDeclarations(db, partition.id, capture.query)]).toEqual([capture]);
});

test("strict reference schema12 migration rolls back new tables and preserves old pinned generations", ({ scratch }) => {
  const path = join(scratch, "reference-upgrade.sqlite");
  const before = createPriorStorage(path, 12);
  using pinned = new DatabaseSync(path, { readOnly: true });
  pinned.exec("BEGIN");
  expect(legacyRows(pinned)).toEqual(before);
  const execute = DatabaseSync.prototype.exec;
  const failure = vi.spyOn(DatabaseSync.prototype, "exec").mockImplementation(function (this: DatabaseSync, sql: string): void {
    if (sql.startsWith("ALTER TABLE inventory_descriptor ADD COLUMN referenceMode")) {
      throw new Error("reference coverage migration failed");
    }
    execute.call(this, sql);
  });
  try {
    expect(() => openInventoryDatabase(path)).toThrow("reference coverage migration failed");
  } finally {
    failure.mockRestore();
  }
  using observer = new DatabaseSync(path, { readOnly: true });
  expect(observer.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 12 });
  expect(observer.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'inventory_reference_query%'").all()).toEqual([]);
  expect(legacyRows(observer)).toEqual(before);
  using current = openInventoryDatabase(path);
  expect(current.prepare(STORAGE_VERSION).get()).toEqual({ ["user_version"]: 15 });
  expect(legacyRows(current)).toEqual(before);
  expect(current.prepare("SELECT referenceMode FROM inventory_descriptor").all()).toEqual([{ referenceMode: "complete" }]);
  expect(pinned.prepare("SELECT id,format FROM inventory_generation").all()).toEqual([{ id: 1, format: 19 }]);
  expect(pinned.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'inventory_reference_query%'").all()).toEqual([]);
  expect(legacyRows(pinned)).toEqual(before);
  expect(current.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  pinned.exec("ROLLBACK");
});
