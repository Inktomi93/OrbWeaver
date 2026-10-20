// @subject tooling/src/floor/code-facts/drizzle-select.ts
// @subject tooling/src/floor/code-facts/drizzle-statement.ts
import { nativeFixture, statementObservations } from "@orb/testkit/node/native-drizzle.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readStatementOf } from "@orb/tooling/floor/code-facts/drizzle-statement";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const HEAD = 'import {eq,sql,type SQL} from "drizzle-orm"; import {personas,type Db} from "@orb/db";';
const OWNED = "db.select().from(personas).where(eq(personas.ownerId,ownerId))";
const CASES = [
  { name: "indexed awaited rows are not editable builders", body: `const row=(await ${OWNED})[0]; return row?.id;`, findings: 0, settled: true },
  { name: "direct indexed row return settles native query", body: `return (await ${OWNED})[0];`, findings: 0, settled: true },
  { name: "mapped awaited rows retain their owner predicate", body: `return (await ${OWNED}).map(row=>row.id);`, findings: 0, settled: true },
  {
    name: "opaque row consumer is not a query escape",
    before: "declare function consume(value: typeof personas.$inferSelect | undefined):void;",
    body: `consume((await ${OWNED})[0]);`,
    findings: 0,
    settled: true,
  },
  {
    name: "indexed unowned by-id read still flags",
    body: "return (await db.select().from(personas).where(eq(personas.id,ownerId)))[0];",
    findings: 1,
    settled: true,
  },
  {
    name: "indexed joined parent retains its direct owner predicate",
    before: 'import {characters,characterEmbeddings} from "@orb/db";',
    body: "const row=(await db.select({id:characters.id}).from(characterEmbeddings).innerJoin(characters,eq(characters.id,characterEmbeddings.characterId)).where(eq(characters.ownerId,ownerId)))[0]; return row?.id;",
    findings: 0,
    settled: true,
  },
  {
    name: "indexed joined parent cannot inherit scope from its own satellite",
    before: 'import {characters,characterEmbeddings} from "@orb/db";',
    body: "return (await db.select({id:characters.id}).from(characterEmbeddings).innerJoin(characters,eq(characters.id,characterEmbeddings.characterId)).where(eq(characters.id,ownerId)))[0];",
    findings: 1,
    token: "characters",
    settled: true,
  },
  {
    name: "awaiting getSQL does not settle a containing carrier",
    before: "declare function consume(value:SQL):void;",
    body: `consume(await ${OWNED}.getSQL());`,
    findings: 1,
    settled: false,
  },
  {
    name: "SQL conversion mutation remains unsafe before row indexing",
    body: `return (await db.all(${OWNED}.getSQL().append(sql\` OR 1\`)))[0];`,
    findings: 1,
    settled: false,
  },
  {
    name: "native alias construction remains an opaque editable carrier",
    before: 'declare function consume(value:import("drizzle-orm").SQLWrapper):void;',
    body: `consume(${OWNED}.as("held"));`,
    findings: 1,
    settled: false,
  },
] as const;

for (const { name, ...scenario } of CASES) {
  test(name, async ({ plantedTree, repoRoot }) => {
    const producer = `${HEAD}${"before" in scenario ? scenario.before : ""}export async function read(db:Db,ownerId:string){${scenario.body}}`;
    const fixture = await nativeFixture({ plantedTree, repoRoot }, { producer, recipient: "" });
    const observations = statementObservations(fixture.root, fixture.project);
    const statement = readStatementOf(fixture.anchor, observations);
    expect(statement.refusals).toEqual([]);
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
    expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(
      Array.from({ length: scenario.findings }, () => ("token" in scenario ? scenario.token : "personas")),
    );
    expect(statement.escapes).toBe(!scenario.settled);
  });
}
