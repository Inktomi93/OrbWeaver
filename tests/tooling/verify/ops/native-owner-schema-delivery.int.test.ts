import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { nativeOwnerReadFixture as fixture, SCHEMA } from "@orb/testkit/node/native-owner-read-fixture.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, TypeChecker } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import type { SchemaFact } from "../../../../tooling/src/floor/code-facts/schema-model-contract.ts";
import type { SchemaProjectedModel } from "../../../../tooling/src/floor/code-facts/schema-projection-contract.ts";
import type { NativeTypeRequest } from "../../../../tooling/src/verify/contract/project-context.ts";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { foreignKeyEdges } from "../../../../tooling/src/verify/lib/tenancy-scope.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";

// Local callbacks judge native-child historical facts and consumer leases, not current producer authority.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => {
  vi.restoreAllMocks();
});

test(
  "native full-schema owner delivery retains composite FK direction, satellite refusal and exact waiver identity without ordinary schema semantics",
  ({ scratch, repoRoot }) => {
    fixture(
      scratch,
      repoRoot,
      `import type{BaseSQLiteDatabase}from"drizzle-orm/sqlite-core";
import{and,eq}from"drizzle-orm";
import{chats,personas,workloads,worldBooks,globalBooks}from"../../../../../db/src/schema/persona.ts";
declare const db:BaseSQLiteDatabase<"async",void>;
export async function inherited(chatId:string){return db.select().from(chats).innerJoin(personas,eq(chats.anchorPersonaId,personas.id)).where(eq(chats.id,chatId));}
export async function reverse(owner:string){return db.select().from(personas).innerJoin(workloads,eq(workloads.chatId,personas.id)).where(eq(personas.ownerId,owner));}
export async function satellite(bookId:string){return db.select().from(globalBooks).innerJoin(worldBooks,eq(globalBooks.bookId,worldBooks.id)).where(eq(globalBooks.bookId,bookId));}
export async function scoped(owner:string,id:string){return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,owner)));}
// @orb-waive owner-scoped-reads(personas): exact owner-read fixture identity; ends with this fixture.
export async function waived(id:string){return db.select().from(personas).where(eq(personas.id,id));}
`,
    );
    writeFileSync(
      join(scratch, SCHEMA),
      `import{sqliteTable,text,foreignKey}from"drizzle-orm/sqlite-core";
export const personas=sqliteTable("personas",{id:text("id").primaryKey(),ownerId:text("owner_id").notNull().$type<string>()});
export const chats=sqliteTable("chats",{id:text("id").primaryKey(),anchorPersonaId:text("anchor_persona_id"),anchorOwnerId:text("anchor_owner_id")},t=>[foreignKey({columns:[t.anchorPersonaId,t.anchorOwnerId],foreignColumns:[personas.id,personas.ownerId]})]);
export const workloads=sqliteTable("workloads",{id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),chatId:text("chat_id").references(()=>chats.id)});
export const worldBooks=sqliteTable("world_books",{id:text("id").primaryKey(),ownerId:text("owner_id").notNull()});
export const globalBooks=sqliteTable("global_books",{bookId:text("book_id").references(()=>worldBooks.id)});
`,
    );
    const context = projectCtx(scratch);
    const requests: NativeTypeRequest[] = [];
    let catalog: SchemaFact<SchemaProjectedModel> | undefined;
    let disposedRead: (() => void) | undefined;
    const unsealedErrors: Error[] = [];
    const restores: (() => void)[] = [];
    const previousLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 100;
    const schemaFrame = (): boolean => /\/code-facts\/schema-(?:query|value|resolve)\.ts:/u.test(new Error("schema frame").stack ?? "");
    const readType = TypeChecker.prototype.getTypeAtLocation;
    const readSymbol = Node.prototype.getSymbol;
    const typePoison = vi.spyOn(TypeChecker.prototype, "getTypeAtLocation").mockImplementation(function (this: TypeChecker, node: Node) {
      if (node.getProject() === context.project && schemaFrame()) {
        throw new Error("ordinary full-schema Type read");
      }
      return readType.call(this, node);
    });
    const symbolPoison = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project && schemaFrame()) {
        throw new Error("ordinary full-schema Symbol read");
      }
      return readSymbol.call(this);
    });
    try {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        policies: [gate],
        knownPolicies: [gate],
        reviewedGrants: [],
        failOnWarnings: false,
        nativeTypeFacts: () => {
          const session = context.nativeTypeFacts?.();
          if (session === undefined) {
            throw new Error("native owner schema control has no importing context");
          }
          const request = session.request;
          const requestSpy = vi.spyOn(session, "request").mockImplementation((owner, query) => {
            requests.push(query);
            request(owner, query);
            if (query.kind === "schema-data") {
              try {
                session.schemaData(owner, query.nodes);
              } catch (error) {
                if (!(error instanceof Error)) {
                  throw error;
                }
                unsealedErrors.push(error);
              }
              disposedRead = () => {
                session.schemaData(owner, query.nodes);
              };
            }
          });
          restores.push(() => requestSpy.mockRestore());
          const schemaData = session.schemaData;
          const dataSpy = vi.spyOn(session, "schemaData").mockImplementation((owner, sources, projection) => {
            catalog = schemaData(owner, sources, projection);
            return catalog;
          });
          restores.push(() => dataSpy.mockRestore());
          return session;
        },
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.effectiveFindings.map(({ token, line }) => ({ token, line }))).toEqual([
        { token: "workloads", line: 6 },
        { token: "worldBooks", line: 7 },
      ]);
      expect(result.authority.waivedFindings.map(({ finding: { token, line } }) => ({ token, line }))).toEqual([{ token: "personas", line: 10 }]);
      expect(result.authority.authorityAlarms).toEqual([]);
      expect(requests.filter(({ kind }) => kind === "invocation-evidence")).toEqual([]);
      expect(unsealedErrors.map(({ message }) => message)).toEqual(["native type requests must be sealed before reading"]);
      if (disposedRead === undefined) {
        throw new Error("native schema read lifetime was not exercised");
      }
      expect(disposedRead).toThrow("native full schema data roster is incomplete");
      expect(
        requests
          .filter(({ kind }) => kind === "schema-data")
          .map((query) =>
            query.nodes.map((node) =>
              node
                .getSourceFile()
                .getFilePath()
                .slice(scratch.length + 1),
            ),
          ),
      ).toEqual([[SCHEMA]]);
      if (catalog?.status !== "ready") {
        throw new Error("owner read did not consume the native full-schema catalog");
      }
      expect(catalog.receipt).toMatchObject({ paths: [SCHEMA], tables: 5, columns: 11, foreignKeys: 3 });
      expect([...foreignKeyEdges(catalog.value)].toSorted()).toEqual([
        "chats.anchorOwnerId->personas.ownerId",
        "chats.anchorPersonaId->personas.id",
        "globalBooks.bookId->worldBooks.id",
        "workloads.chatId->chats.id",
      ]);
      expect(
        catalog.value.tables.find((table) => table.sqlName === "personas")?.columns.find((column) => column.identity.propertyName === "ownerId")?.typeOverride,
      ).not.toHaveProperty("type");
    } finally {
      for (const restore of restores.toReversed()) {
        restore();
      }
      symbolPoison.mockRestore();
      typePoison.mockRestore();
      Error.stackTraceLimit = previousLimit;
    }
  },
  scaledBudget(90_000),
);

test(
  "missing native full-schema delivery withholds owner authority without the ordinary schema fallback",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    let restore: (() => void) | undefined;
    try {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        policies: [gate],
        knownPolicies: [gate],
        reviewedGrants: [],
        failOnWarnings: false,
        nativeTypeFacts: () => {
          const session = context.nativeTypeFacts?.();
          if (session === undefined) {
            throw new Error("native schema refusal control has no importing context");
          }
          const read = session.schemaData;
          const spy = vi.spyOn(session, "schemaData").mockImplementation((owner, _sources, projection) => read(owner, [], projection));
          restore = () => spy.mockRestore();
          return session;
        },
      });
      expect(result.factErrors).toEqual([{ factId: "drizzle-schema-data", phase: "finish", message: "native full schema data has no admitted source owner" }]);
      expect(result.toolErrors).toEqual([
        {
          policyId: gate.id,
          phase: "evaluate",
          message: "declared fact failed: drizzle-schema-data: finish: native full schema data has no admitted source owner",
        },
      ]);
      expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
      expect(result.authority.effectiveFindings).toEqual([]);
    } finally {
      restore?.();
    }
  },
  scaledBudget(60_000),
);
