// Async assimilation closes executed native queries, not arbitrary SQL-shaped returned carriers.
import { closeDb, createDb } from "@orb/db";
import { nativeFixture, statementObservations } from "@orb/testkit/node/native-drizzle.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readCallReturnProgram } from "@orb/tooling/floor/code-facts/call-returns";
import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SyntaxKind } from "ts-morph";
import { sqlCarrierUseStable } from "../../../../tooling/src/floor/code-facts/drizzle-sql-stability.ts";

test("async native query assimilation closes declarations, arrows, expressions and methods but no returned SQL carrier", async ({ plantedTree, repoRoot }) => {
  const fixture = await nativeFixture(
    { plantedTree, repoRoot },
    {
      producer: `import {eq,sql,type SQL} from "drizzle-orm";import {personas,type Db} from "@orb/db";
export async function declaration(db:Db,id:string){const child=eq(personas.ownerId,id);return db.select().from(personas).where(child);}
export const arrow=async(db:Db,id:string)=>{const child=eq(personas.ownerId,id);return db.select().from(personas).where(child);};
export const expression=function named(db:Db,id:string){const child=eq(personas.ownerId,id);return db.select().from(personas).where(child);};
export const asyncExpression=async function named(db:Db,id:string){const child=eq(personas.ownerId,id);return db.select().from(personas).where(child);};
export const methods={async method(db:Db,id:string){const child=eq(personas.ownerId,id);return db.select().from(personas).where(child);}};
export function synchronous(db:Db,id:string){const child=eq(personas.ownerId,id);return db.select().from(personas).where(child);}
export async function raw(db:Db,id:string){const child=eq(personas.ownerId,id);return db.select().from(personas).where(child).getSQL();}
export async function subquery(db:Db,id:string){const child=eq(personas.ownerId,id);return db.select().from(personas).where(child).as("sq");}
export async function cte(db:Db,id:string){const child=eq(personas.ownerId,id);return db.$with("sq").as(db.select().from(personas).where(child));}
export async function object(db:Db,id:string){const child=eq(personas.ownerId,id);return {query:db.select().from(personas).where(child)};}
declare function foreign(q:SQL):PromiseLike<readonly object[]>;
export async function unknownThen(db:Db,id:string){const child=eq(personas.ownerId,id);db.select().from(personas);return foreign(child);}
export async function mutated(db:Db,id:string){const child=eq(personas.ownerId,id);child.append(sql\` OR 1\`);return db.select().from(personas).where(child);}
export const concise=async(db:Db,id:string)=>db.select().from(personas).where(eq(personas.ownerId,id));
`,
      recipient: "",
    },
  );
  const observations = statementObservations(fixture.root, fixture.project);
  const program = readCallReturnProgram(fixture.anchor, observations);
  if (program.kind !== "resolved") {
    throw new Error("native async control lost its complete importing context");
  }
  const children = fixture.source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).flatMap((declaration) => {
    const value = declaration.getInitializer();
    return declaration.getName() === "child" && value !== undefined ? [value] : [];
  });
  expect(children).toHaveLength(12);
  expect(children.map((child) => sqlCarrierUseStable(child, program.value))).toEqual([
    true,
    true,
    false,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  const concise = fixture.source
    .getVariableDeclarationOrThrow("concise")
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "eq");
  if (concise === undefined) {
    throw new Error("native concise arrow control lost its owner predicate");
  }
  expect(sqlCarrierUseStable(concise, program.value)).toBe(true);
});

test("installed native query async declarations and arrows return settled rows rather than editable builders", async () => {
  const rows = sqliteTable("async_owner_rows", { id: text("id").primaryKey() });
  const db = await createDb(":memory:");
  try {
    async function declaration(): Promise<(typeof rows.$inferSelect)[]> {
      await db.run(sql`CREATE TABLE async_owner_rows (id TEXT PRIMARY KEY)`);
      await db.insert(rows).values({ id: "owned" });
      return db.select().from(rows);
    }
    const arrow = async (): Promise<(typeof rows.$inferSelect)[]> => db.select().from(rows);
    expect(await declaration()).toEqual([{ id: "owned" }]);
    expect(await arrow()).toEqual([{ id: "owned" }]);
  } finally {
    closeDb(db);
  }
});
