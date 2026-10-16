// @subject tooling/src/floor/code-facts/schema-identity.ts
// @subject tooling/src/floor/code-facts/drizzle-evidence.ts
import { join } from "node:path";
import { nativeFixture, SCOPE_HEAD } from "@orb/testkit/node/native-drizzle.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { readDrizzleCallEvidence } from "../../../../tooling/src/floor/code-facts/drizzle-evidence.ts";
import { replayDrizzleCallEvidence, replaySchemaIdentityCatalog } from "../../../../tooling/src/floor/code-facts/drizzle-evidence-replay.ts";
import type { InventorySchemaIdentityCatalog } from "../../../../tooling/src/floor/code-facts/drizzle-inventory-contract.ts";
import { readCalledMember } from "../../../../tooling/src/floor/code-facts/drizzle-write-chain.ts";
import { readInstanceMethodInvocation } from "../../../../tooling/src/floor/code-facts/reference-fact-invocation.ts";
import { readSchemaIdentities, schemaIdentityQuery } from "../../../../tooling/src/floor/code-facts/schema-identity.ts";
import type { SchemaIdentityQuery } from "../../../../tooling/src/floor/code-facts/schema-identity-contract.ts";
import { createSchemaQuery } from "../../../../tooling/src/floor/code-facts/schema-query.ts";
import { schemaDeclarationKey } from "../../../../tooling/src/floor/code-facts/schema-value.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { encodeDrizzleCallEvidence, encodeSchemaIdentityCatalog } from "../../../../tooling/src/floor/compiler/drizzle-evidence-encode.ts";
import { scaledBudget } from "../../_load-budget.ts";

function locations(nodes: readonly MorphNode[]): readonly string[] {
  return nodes.map((node) => `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}:${node.getKind()}`);
}

function span(node: MorphNode): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

test(
  "native Drizzle projections retain full schema census, original instance declarations and effective argument observations",
  async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      {
        producer: `${SCOPE_HEAD}
export function writes(db:Db){
 const held=db.insert.bind(db,assets);
 const reboundFn=held.bind(db);
 const rebound=reboundFn();
 const capture=db.insert.bind(db,assets);
 const direct=db.insert(assets);
 const bound=held();
 const called=db.insert.call(db,assets);
 const applied=db.insert.apply(db,[assets]);
 const spread=db.insert(...[assets] as const);
 return {direct,bound,called,applied,spread,rebound,capture};
}
declare function escape(value:readonly object[]):void;
export function refusals(db:Db){
 let rewritten=db.insert.bind(db);
 rewritten=db.insert.bind(db);
 const write=rewritten(assets);
 const tuple=[assets] as const;
 escape(tuple);
 const escaping=db.insert(...tuple);
 return {write,escaping};
}
export function foreign(db:{insert(table:object):void}){return db.insert(assets);}
export function opaque(db:Record<string,(table:object)=>void>){return db.insert(assets);}
export function nullable(db:{insert(table:object):void}|undefined){return db?.insert(assets);}
export function read(db:Db){return db.select().from(assets);}
`,
        recipient: "",
      },
    );
    const source = fixture.project.getSourceFileOrThrow(fixture.source.getFilePath());
    const schemaSource = fixture.project.getSourceFileOrThrow(join(fixture.root, "packages/db/src/schema/persona.ts"));
    const options = {
      files: [schemaSource],
      relativePath: (file: SourceFile): string => file.getFilePath().slice(fixture.root.length + 1),
      checker: () => fixture.project.getTypeChecker(),
    };
    const full = createSchemaQuery(options).schema();
    const identities = readSchemaIdentities(options);
    expect(identities.status).toBe("ready");
    expect(identities.receipt).toEqual(full.receipt);
    if (identities.status !== "ready") {
      throw new Error(identities.reason);
    }
    expect(identities.value.tables.every((table) => !Reflect.has(table, "columns"))).toBe(true);
    const query = schemaIdentityQuery(identities, new Map(identities.value.tables.map((table) => [schemaDeclarationKey(table.declaration), table])));
    const wireCatalog = encodeSchemaIdentityCatalog(options.files, identities, span, options.relativePath);
    const carriers = new Project({ useInMemoryFileSystem: true });
    const replay = (value: InventorySpan): MorphNode => {
      const original = fixture.project.getSourceFileOrThrow(value.file);
      const carrier = carriers.getSourceFile(value.file) ?? carriers.createSourceFile(value.file, original.getFullText());
      const leaf = carrier.getDescendantAtPos(value.start);
      const node = [carrier, leaf, ...(leaf?.getAncestors() ?? [])].find(
        (candidate) => candidate?.getStart() === value.start && candidate.getEnd() === value.end && candidate.getKind() === value.kind,
      );
      if (node === undefined) {
        throw new Error("roundtrip span missing");
      }
      return node;
    };
    const fn = source.getFunctionOrThrow("writes");
    for (const name of ["direct", "bound", "called", "applied", "spread", "rebound"]) {
      const call = fn.getVariableDeclarationOrThrow(name).getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
      const canonical = readInstanceMethodInvocation(call);
      const delivered = readDrizzleCallEvidence(call, "instance", query);
      expect(delivered.mode).toBe("instance");
      if (delivered.mode !== "instance" || canonical.kind !== "resolved" || delivered.invocation.kind !== "resolved") {
        throw new Error("native instance projection is missing");
      }
      expect(delivered.invocation.trace).toEqual(canonical.trace);
      expect(locations(delivered.invocation.value.target.member.declarations)).toEqual(locations(canonical.value.target.member.declarations));
      expect(Reflect.has(delivered.invocation.value.target.member, "symbol")).toBe(false);
      expect(Reflect.has(delivered.invocation.value.target, "signature")).toBe(false);
      expect(Reflect.has(delivered.invocation.value, "executedSignature")).toBe(false);
      expect(delivered.invocation.value.arguments).toEqual(canonical.value.arguments);
      expect(delivered.table?.references).toMatchObject([{ kind: "table", declaration: expect.anything() }]);
      expect(delivered.table?.stability[0]?.node.getText()).toBe("assets");
      expect(delivered.table?.stability.length).toBeGreaterThan(1);
      const encoded = encodeDrizzleCallEvidence(delivered, span);
      const types = vi.spyOn(Node.prototype, "getType").mockImplementation(() => {
        throw new Error("replay cannot read Type");
      });
      const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(() => {
        throw new Error("replay cannot read Symbol");
      });
      try {
        const catalog = replaySchemaIdentityCatalog(wireCatalog, replay);
        expect(encodeDrizzleCallEvidence(replayDrizzleCallEvidence(encoded, catalog, replay, call), span)).toEqual(encoded);
        expect(() => replayDrizzleCallEvidence({ ...encoded, table: null }, catalog, replay, call)).toThrow("argument evidence");
      } finally {
        types.mockRestore();
        symbols.mockRestore();
      }
    }
    assertCaptureAndRefusalReplay(source, query, wireCatalog, replay);
    for (const name of ["foreign", "opaque", "nullable"]) {
      const call = source.getFunctionOrThrow(name).getDescendantsOfKind(SyntaxKind.CallExpression)[0];
      if (call === undefined) {
        throw new Error("called member fixture is missing");
      }
      const canonical = readCalledMember(call);
      const delivered = readDrizzleCallEvidence(call, "called-member", query);
      expect(delivered.mode === "called-member" ? delivered.member : undefined).toEqual(canonical);
      expect(delivered.mode === "called-member" ? delivered.table?.kind : undefined).toBe("resolved");
      expect(canonical.kind === "resolved" && canonical.value.declarations.length === 0).toBe(name !== "foreign");
      const encoded = encodeDrizzleCallEvidence(delivered, span);
      const catalog = replaySchemaIdentityCatalog(wireCatalog, replay);
      expect(encodeDrizzleCallEvidence(replayDrizzleCallEvidence(encoded, catalog, replay, call), span)).toEqual(encoded);
      expect(() => replayDrizzleCallEvidence({ ...encoded, table: null }, catalog, replay, call)).toThrow("direct argument evidence");
    }
    expect(() => replaySchemaIdentityCatalog({ ...wireCatalog, sources: [] }, replay)).toThrow("roster coverage");
    if (wireCatalog.fact.status !== "ready") {
      throw new Error("roundtrip catalog unavailable");
    }
    const readyFact = wireCatalog.fact;
    expect(() => replaySchemaIdentityCatalog({ ...wireCatalog, fact: { ...readyFact, value: { tables: [] } } }, replay)).toThrow("table coverage");
    const stale = carriers.getSourceFileOrThrow(schemaSource.getFilePath());
    stale.replaceWithText(stale.getFullText().replace("personas", "personaZ"));
    expect(() => replaySchemaIdentityCatalog(wireCatalog, replay)).toThrow("missing or stale");
  },
  scaledBudget(30_000),
);

test("schema identity projection keeps missing, empty and full-extraction errors rather than table-only success", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/repo/packages/db/src/schema/test.ts", "export const quiet=true;");
  const options = { files: [source], relativePath: (): string => "packages/db/src/schema/test.ts", checker: () => project.getTypeChecker() };
  expect(readSchemaIdentities({ ...options, files: [] })).toMatchObject({ status: "missing", receipt: { paths: [], members: 0 } });
  expect(readSchemaIdentities(options)).toMatchObject({ status: "empty", receipt: { tables: 0, members: 0 } });
  for (const column of ["opaque()", "text('profile',{mode:'json'}).$type<{name:string}>().$type<{other:string}>()", "text(dynamicName)"]) {
    source.replaceWithText(
      `import {sqliteTable,text} from 'drizzle-orm/sqlite-core';declare function opaque():object;declare const dynamicName:string;export const table=sqliteTable('table',{id:${column}});`,
    );
    const canonical = createSchemaQuery(options).schema();
    expect(canonical.status).toBe("unresolved");
    expect(readSchemaIdentities(options)).toEqual(canonical);
  }
  source.replaceWithText(
    "import {sqliteTable,text,index} from 'drizzle-orm/sqlite-core';export const table=sqliteTable('table',{id:text('id')},()=>[index('bad')]);",
  );
  expect(readSchemaIdentities(options)).toMatchObject({ status: "unresolved", reason: expect.stringContaining("on(...)"), receipt: { tables: 0, members: 0 } });
});

function assertCaptureAndRefusalReplay(
  source: SourceFile,
  query: SchemaIdentityQuery,
  wireCatalog: InventorySchemaIdentityCatalog,
  replay: (span: InventorySpan) => MorphNode,
): void {
  const capture = source.getFunctionOrThrow("writes").getVariableDeclarationOrThrow("capture").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
  const captured = readDrizzleCallEvidence(capture, "instance", query);
  expect(captured).toMatchObject({ mode: "instance", invocation: { kind: "resolved", value: { invocation: "bind" } }, table: null });
  const captureWire = encodeDrizzleCallEvidence(captured, span);
  expect(encodeDrizzleCallEvidence(replayDrizzleCallEvidence(captureWire, replaySchemaIdentityCatalog(wireCatalog, replay), replay, capture), span)).toEqual(
    captureWire,
  );
  for (const name of ["write", "escaping"]) {
    const call = source.getFunctionOrThrow("refusals").getVariableDeclarationOrThrow(name).getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    const evidence = readDrizzleCallEvidence(call, "instance", query);
    const canonical = readInstanceMethodInvocation(call);
    if (evidence.mode !== "instance") {
      throw new Error("native refusal projection is foreign");
    }
    expect(evidence.table).toBeNull();
    expect(evidence.invocation.kind).toBe(canonical.kind);
    const refusal = evidence.invocation.kind === "unresolved" ? evidence.invocation : evidence.invocation.value.arguments;
    expect(refusal).toMatchObject({ kind: "unresolved", reason: "write" });
    const wire = encodeDrizzleCallEvidence(evidence, span);
    expect(encodeDrizzleCallEvidence(replayDrizzleCallEvidence(wire, replaySchemaIdentityCatalog(wireCatalog, replay), replay, call), span)).toEqual(wire);
  }
}
