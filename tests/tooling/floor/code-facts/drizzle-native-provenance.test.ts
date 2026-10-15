// @subject tooling/src/floor/code-facts/drizzle-table-ref.ts
// @subject tooling/src/floor/code-facts/drizzle-statement.ts
// @subject tooling/src/floor/code-facts/drizzle-sql-stability.ts
import { nativeFixture, SCOPE_HEAD } from "@orb/testkit/node/native-drizzle.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { resolveDrizzleTableRefs } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const CORRELATION = `import {alias} from "drizzle-orm/sqlite-core"; const seats=alias(chatParticipants,"seats");
function visible(db:Db) { return exists(db.select({id:characters.id}).from(seats)
 .innerJoin(characters,eq(characters.id,seats.characterId))
 .where(and(eq(seats.chatId,chats.id),sql\`lower(\${characters.id}) like \${"needle"}\`))); }`;
const PIN = "and(eq(chatParticipants.userId,ownerId),isNull(chatParticipants.leftSeq),eq(chatParticipants.chatId,chats.id))";
const CTE = `import {personas} from "@orb/db";
export function cohort(db:Db,ownerId:string) { const held=db.$with("cohort").as(db.select().from(personas).where(eq(personas.ownerId,ownerId))); return {held}; }`;
const NESTED_CTES = Array.from({ length: 9 }, (_, index) => {
  const source = index === 0 ? "personas" : `c${String(index - 1)}`;
  const where = index === 0 ? ".where(eq(personas.ownerId,ownerId))" : "";
  return `const c${String(index)}=db.$with("c${String(index)}").as(db.select().from(${source})${where});`;
}).join("\n");
const CASES = [
  {
    name: "cyclic native CTE row source refuses without checker recursion",
    producer: 'import type {WithSubquery} from "drizzle-orm/subquery";',
    body: 'const cyclic:WithSubquery = db.$with("cyclic").as(qb=>qb.select().from(cyclic)); return await db.with(cyclic).select().from(cyclic);',
    findings: ["cyclic"],
  },
  {
    name: "imported destructured CTE permits unrelated primitive sibling arithmetic",
    producer: CTE.replace("return {held};", "return {held,count:1};"),
    body: "const {held:active,count}=cohort(db,ownerId); console.log(count+1); return await db.with(active).select().from(active);",
    findings: [],
    imported: true,
  },

  {
    name: "asserted primitive-array SQL sibling retains its physical carrier obligation",
    producer: CTE.replace("return {held};", "return {held,count:held as typeof held & number[]};"),
    before: 'declare function escape(value:import("drizzle-orm").SQLWrapper):void;',
    body: "const {held:active,count}=cohort(db,ownerId); escape(count); return await db.with(active).select().from(active);",
    findings: ["personas"],
    imported: true,
  },
  {
    name: "nested native CTE scope is not truncated after four sources",
    producer: 'import {personas} from "@orb/db";',
    body: NESTED_CTES + "return await db.with(c0,c1,c2,c3,c4,c5,c6,c7,c8).select().from(c8).where(eq(c8.id,ownerId));",
    findings: [],
  },
  {
    name: "deep native CTE cannot erase its missing producer owner predicate",
    producer: 'import {personas} from "@orb/db";',
    body:
      NESTED_CTES.replace(".where(eq(personas.ownerId,ownerId))", "") +
      "return await db.with(c0,c1,c2,c3,c4,c5,c6,c7,c8).select().from(c8).where(eq(c8.id,ownerId));",
    findings: ["c8"],
  },
  {
    name: "correlated EXISTS in inner ON inherits the pinned outer room",
    producer: CORRELATION,
    body: `return await db.select({id:chats.id}).from(chats).innerJoin(chatParticipants,and(${PIN},visible(db)));`,
    findings: [],
  },
  {
    name: "correlated EXISTS in left ON retains its own joined-row proof",
    producer: CORRELATION,
    body: `return await db.select({id:chats.id}).from(chats).leftJoin(chatParticipants,and(${PIN},visible(db)));`,
    findings: ["characters"],
  },
  {
    name: "inner ON correlation cannot borrow a missing current-member pin",
    producer: CORRELATION,
    body: "return await db.select({id:chats.id}).from(chats).innerJoin(chatParticipants,and(eq(chatParticipants.chatId,chats.id),visible(db)));",
    findings: ["characters"],
  },
  {
    name: "one unpinned inner ON consumer refuses the shared correlation",
    producer: CORRELATION,
    body: `await db.select({id:chats.id}).from(chats).innerJoin(chatParticipants,and(${PIN},visible(db))); return await db.select().from(chats).innerJoin(chatParticipants,visible(db));`,
    findings: ["characters"],
  },
  {
    name: "imported destructured CTE retains its physical native lifetime",
    producer: CTE,
    body: "const {held:active}=cohort(db,ownerId); return await db.with(active).select().from(active);",
    findings: [],
    imported: true,
  },
  {
    name: "imported destructured CTE cannot erase containing getSQL mutation",
    producer: CTE,
    body: "const {held:active}=cohort(db,ownerId); active.getSQL().append(sql` OR 1`); return await db.with(active).select().from(active);",
    findings: ["personas"],
    imported: true,
  },
  {
    name: "imported destructured CTE cannot erase opaque consumer",
    producer: CTE,
    body: "const {held:active}=cohort(db,ownerId); escape(active); return await db.with(active).select().from(active);",
    before: 'declare function escape(value:import("drizzle-orm").SQLWrapper):void;',
    findings: ["personas"],
    imported: true,
  },
  {
    name: "unavailable higher-order consumer refuses a returned query",
    producer:
      'import {personas} from "@orb/db"; export function pending(db:Db,ownerId:string) { return db.select().from(personas).where(eq(personas.ownerId,ownerId)); }',
    body: "return run(()=>pending(db,ownerId));",
    before: 'declare function run(make:()=>import("drizzle-orm").SQLWrapper):void;',
    findings: ["personas"],
  },
  {
    name: "authored higher-order consumer cannot erase callback escape",
    producer:
      'import {personas} from "@orb/db"; export function pending(db:Db,ownerId:string) { return db.select().from(personas).where(eq(personas.ownerId,ownerId)); }',
    before: 'declare function escape(make:()=>import("drizzle-orm").SQLWrapper):void;',
    body: "async function run(make:()=>ReturnType<typeof pending>) {escape(make); return await make();} return await run(()=>pending(db,ownerId));",
    findings: ["personas"],
  },
  {
    name: "unknown higher-order actual alternative cannot borrow the known callback",
    producer:
      'import {personas} from "@orb/db"; export function pending(db:Db,ownerId:string) { return db.select().from(personas).where(eq(personas.ownerId,ownerId)); }',
    before: "declare const choose:boolean; declare const foreign:()=>ReturnType<typeof pending>;",
    body: "async function run(make:()=>ReturnType<typeof pending>) {return await make();} return await run(choose?()=>pending(db,ownerId):foreign);",
    findings: ["personas"],
  },
  {
    name: "authored higher-order consumer executes its actual returned query",
    producer:
      'import {personas} from "@orb/db"; export function pending(db:Db,ownerId:string) { return db.select().from(personas).where(eq(personas.ownerId,ownerId)); }',
    body: "async function run(make:()=>ReturnType<typeof pending>) {return await make();} return await run(()=>pending(db,ownerId));",
    findings: [],
  },
] as const;

for (const scenario of CASES) {
  test(scenario.name, async ({ plantedTree, repoRoot }) => {
    const read = `${SCOPE_HEAD}${"imported" in scenario ? 'import {cohort} from "./producer.js";' : ""}${"before" in scenario ? scenario.before : ""}
export async function read(db:Db,ownerId:string) {${scenario.body}}`;
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      {
        producer: SCOPE_HEAD + scenario.producer + ("imported" in scenario ? "" : read.replace(SCOPE_HEAD, "")),
        recipient: "imported" in scenario ? read : "",
      },
    );
    const result = runPolicyPass({
      knownPolicies: [gate],
      policies: [gate],
      root: fixture.root,
      project: fixture.project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.policies[0]?.owner.status).toBe("success");
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(scenario.findings);
  });
}

for (const scenario of [
  { constraint: "typeof characters", names: ["characters"] },
  { constraint: "typeof characters | typeof assets", names: ["characters", "assets"] },
  { constraint: 'import("drizzle-orm/sqlite-core").SQLiteTable', names: ["unresolved"] },
] as const) {
  test(`generic table enumeration retains ${scenario.constraint}`, async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      {
        producer: `${SCOPE_HEAD}export async function read<T extends ${scenario.constraint}>(db:Db,table:T){ return await db.select().from(table); }`,
        recipient: "",
      },
    );
    const table = fixture.anchor.getArguments()[0];
    if (table === undefined) {
      throw new Error("native generic row source missing");
    }
    expect(
      resolveDrizzleTableRefs(table, () => false)
        .map((ref) => (ref.kind === "sql-name" ? ref.sqlName : ref.kind))
        .toSorted(),
    ).toEqual([...scenario.names].toSorted());
  });
}
