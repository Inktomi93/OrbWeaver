// @subject tooling/src/floor/code-facts/drizzle-sql-projection.ts
// @subject tooling/src/floor/code-facts/drizzle-sql-stability.ts
// @subject tooling/src/verify/lib/tenancy-join.ts

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { nativeFixture, statementObservations } from "@orb/testkit/node/native-drizzle.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readSqlOperandContainment } from "@orb/tooling/floor/code-facts/drizzle-sql";
import { readStatementOf } from "@orb/tooling/floor/code-facts/drizzle-statement";
import { beginReferencePass, endReferencePass } from "@orb/tooling/floor/code-facts/reference-fact";
import { SyntaxKind } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const HEAD = 'import {and,eq,sql,type SQL} from "drizzle-orm"; import {personas,type Db} from "@orb/db";';
const QUERY = "db.select().from(personas).where(and(eq(personas.ownerId,ownerId),fragment))";
const POLICY_CASES = [
  {
    name: "native transparent owner column retains by-id scope",
    body: "return await db.select().from(personas).where(and(eq(personas.id,ownerId),eq(sql`${personas.ownerId}`,ownerId)));",
    findings: 0,
  },
  {
    name: "owner arithmetic is not a transparent column",
    body: "return await db.select().from(personas).where(and(eq(personas.id,ownerId),eq(sql`${personas.ownerId} + 0`,ownerId)));",
    findings: 1,
  },
  {
    name: "transparent owner wrapper cannot hide containing mutation",
    body: "const owner=sql`${personas.ownerId}`; owner.append(sql` OR 1`); return await db.select().from(personas).where(and(eq(personas.id,ownerId),eq(owner,ownerId)));",
    findings: 1,
  },
  {
    name: "selected callback formal metadata mutation refuses owner scope",
    body: 'return await db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)).orderBy(({ownerId})=>{Object.assign(ownerId,{name:"id"}); return ownerId;});',
    findings: 1,
  },
  { name: "native batch executes a literal query carrier", body: `return await db.batch([${QUERY}]);`, findings: 0 },
  {
    name: "closed local collector preserves supplied query chunks",
    body: `const query=${QUERY}; const pending:[typeof query,...typeof query[]]=[query]; pending.push(query); return await db.batch(pending);`,
    findings: 0,
  },
  {
    name: "collector copy escape retains shared-element obligation",
    before: 'declare function escape(value:readonly import("drizzle-orm").SQLWrapper[]):void;',
    body: `const query=${QUERY}; const pending=[query] as const; const copied=[...pending]; escape(copied); return await db.batch(pending);`,
    findings: 1,
  },
  {
    name: "collector index replacement refuses",
    body: `const pending=[${QUERY}]; pending[0]=db.select().from(personas).where(eq(personas.id,ownerId)); return await db.batch([pending[0]!]);`,
    findings: 2,
  },
  {
    name: "opaque collector consumer refuses",
    before: 'declare function escape(value:readonly import("drizzle-orm").SQLWrapper[]):void;',
    body: `const pending=[${QUERY}]; escape(pending); return await db.batch([pending[0]!]);`,
    findings: 1,
  },
] as const;

for (const scenario of POLICY_CASES) {
  test(scenario.name, async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      {
        producer: `${HEAD}${"before" in scenario ? scenario.before : ""}export async function read(db:Db,ownerId:string){const fragment=sql\`1\`;${scenario.body}}`,
        recipient: "",
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
    expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(Array.from({ length: scenario.findings }, () => "personas"));
  });
}

const CALLBACK_CASES = [
  {
    name: "returned native select alias retains actual receiver containment",
    before: "function pending(db:Db,ownerId:string){return db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId));}",
    query: 'db.select().from(pending(db,ownerId).as("cohort"))',
    contained: true,
  },
  {
    name: "returned native getSQL retains actual receiver containment",
    before: "function pending(db:Db,ownerId:string){return db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId));}",
    query: "db.select().from(personas).where(and(eq(personas.ownerId,ownerId),sql`exists (${pending(db,ownerId).getSQL()})`))",
    contained: true,
  },
  {
    name: "returned native getSQL cannot erase physical mutation",
    before: "function pending(db:Db,ownerId:string){return db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId));}",
    query: "db.select().from(personas).where(and(eq(personas.ownerId,ownerId),sql`exists (${pending(db,ownerId).getSQL().append(sql` OR 1`)})`))",
    contained: false,
  },
  {
    name: "returned native alias cannot erase opaque source escape",
    before:
      'declare function escape(value:import("drizzle-orm").SQLWrapper):void; function pending(db:Db,ownerId:string){const held=db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)); escape(held); return held;}',
    query: 'db.select().from(pending(db,ownerId).as("cohort"))',
    contained: false,
  },
  {
    name: "returned actual select cannot borrow overwritten getSQL",
    before:
      "function pending(db:Db,ownerId:string){const held=db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)); Object.assign(held,{getSQL:()=>sql` OR 1`}); return held;}",
    query: "db.select().from(personas).where(and(eq(personas.ownerId,ownerId),sql`exists (${pending(db,ownerId).getSQL()})`))",
    contained: false,
  },
  {
    name: "returned actual select cannot borrow overwritten as",
    before:
      'function pending(db:Db,ownerId:string){const held=db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)); Object.assign(held,{as:()=>db.select().from(personas).as("foreign")}); return held;}',
    query: 'db.select().from(pending(db,ownerId).as("cohort"))',
    contained: false,
  },
  {
    name: "returned native alias preserves unsafe projection refusal",
    before: 'function pending(db:Db,ownerId:string){return db.select({ownerId:sql.raw(" OR 1")}).from(personas).where(eq(personas.ownerId,ownerId));}',
    query: 'db.select().from(pending(db,ownerId).as("cohort"))',
    contained: false,
  },
  {
    name: "selected native callback binds actual own column",
    query: "db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)).orderBy(({ownerId})=>ownerId)",
    contained: true,
  },
  {
    name: "selected native callback binds a renamed own column",
    query: "db.select({selected:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)).orderBy(({selected:column})=>column)",
    contained: true,
  },
  {
    name: "selected native callback cannot grant foreign column",
    before: "declare const foreign:typeof personas.ownerId;",
    query: "db.select({ownerId:foreign}).from(personas).where(eq(personas.ownerId,ownerId)).orderBy(({ownerId})=>ownerId)",
    contained: false,
  },
  {
    name: "callback arbitrary SQL body stays unresolved",
    query: 'db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)).orderBy(()=>sql.raw(" OR 1"))',
    contained: false,
  },
  {
    name: "selected native callback mutation stays unresolved",
    query: "db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)).orderBy(({ownerId})=>ownerId.getSQL().append(sql` OR 1`))",
    contained: false,
  },
  {
    name: "selected callback cannot erase a formal column metadata write",
    query:
      'db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.ownerId,ownerId)).orderBy(({ownerId})=>{Object.assign(ownerId,{name:"id"}); return ownerId;})',
    contained: false,
  },
] as const;

for (const scenario of CALLBACK_CASES) {
  test(scenario.name, async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      {
        producer: `${HEAD}${"before" in scenario ? scenario.before : ""}export async function read(db:Db,ownerId:string){const query=${scenario.query}; return await query;}`,
        recipient: "",
      },
    );
    const expression = fixture.source
      .getFunctionOrThrow("read")
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((declaration) => declaration.getName() === "query")
      ?.getInitializer();
    if (expression === undefined) {
      throw new Error("the actual selected callback query is missing");
    }
    beginReferencePass();
    try {
      expect(readSqlOperandContainment(expression, new Map(), statementObservations(fixture.root, fixture.project))).toBe(scenario.contained);
    } finally {
      endReferencePass();
    }
  });
}

test("native literal batch closes a returned carrier's statement", async ({ plantedTree, repoRoot }) => {
  const fixture = await nativeFixture(
    { plantedTree, repoRoot },
    {
      producer: `${HEAD}function pending(db:Db,ownerId:string){return db.select().from(personas).where(eq(personas.ownerId,ownerId));} export async function read(db:Db,ownerId:string){const rows=await db.batch([pending(db,ownerId)]); return rows;}`,
      recipient: "",
    },
  );
  const statement = readStatementOf(fixture.anchor, statementObservations(fixture.root, fixture.project));
  expect(statement.refusals).toEqual([]);
  expect(statement.escapes).toBe(false);
});

test("actual retained relation and selected callback retain native batch origin", async ({ plantedTree, repoRoot }) => {
  const source = await readFile(join(repoRoot, "packages/server/src/domain/stats/persistence/owner-chat-scope.ts"), "utf8");
  const contract = await readFile(join(repoRoot, "packages/server/src/domain/stats/contract/retained-chat-accounting.ts"), "utf8");
  const accounting = await readFile(join(repoRoot, "packages/server/src/domain/stats/persistence/retained-chat-accounting.ts"), "utf8");
  const constants = contract.match(/^export const RETAINED_CHAT_(?:MEMBERSHIP|OWNERS)_ALIAS = .+;$/gmu);
  const owners = /const retainedOwners = [\s\S]+?\.orderBy\(\(\{ ownerId \}\) => ownerId\);/u.exec(accounting)?.[0];
  if (constants?.length !== 2 || owners === undefined) {
    throw new Error("the actual retained producers changed their declaration shape");
  }
  const producer = source
    .replace('import type { RetainedChatOwnersQuery } from "../contract/retained-chat-accounting.ts";', "")
    .replace(": RetainedChatOwnersQuery =>", " =>")
    .replace('from "../contract/retained-chat-accounting.ts"', 'from "../contract/retained-chat-accounting.js"');
  const recipient = `${HEAD}import {ownerChatIds,chatOwnerIds,retainedChatOwners,retainedCharacterSeatPredicate} from "./producer.js";
import {RETAINED_CHAT_OWNERS_ALIAS} from "../contract/retained-chat-accounting.js";
${owners.replace(": RetainedOwnersRead =>", " =>")}
export async function read(db:Db,ownerId:string,chatId:Parameters<typeof retainedChatOwners>[0]) {
  return await db.batch([retainedOwners(db,chatId),db.select().from(personas).where(and(eq(personas.ownerId,ownerId),
    sql\`\${personas.id} in (\${ownerChatIds(ownerId)})\`,sql\`\${personas.ownerId} in (\${chatOwnerIds(chatId)})\`,
    sql\`(\${retainedCharacterSeatPredicate(sql\`\${ownerId}\`)})\`))]);
}`;
  const fixture = await nativeFixture(
    {
      repoRoot,
      plantedTree: (files) => plantedTree({ ...files, "packages/server/src/domain/persona/contract/retained-chat-accounting.ts": constants.join("\n") }),
    },
    { producer, recipient },
  );
  const selected = fixture.project
    .getSourceFiles()
    .filter((file) => file.getFilePath().startsWith(fixture.root))
    .flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression))
    .find((call) => call.getExpression().getText().endsWith(".orderBy"));
  if (selected === undefined) {
    throw new Error("the actual retained selected callback was not loaded");
  }
  beginReferencePass();
  try {
    const observations = statementObservations(fixture.root, fixture.project);
    expect(readSqlOperandContainment(selected, new Map(), observations)).toBe(true);
  } finally {
    endReferencePass();
  }
});
