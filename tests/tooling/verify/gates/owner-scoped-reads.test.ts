import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, ts } from "ts-morph";
import { vi } from "vitest";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const PATH = "packages/server/src/domain/persona/persistence/read.ts";
const SCHEMA = "packages/db/src/schema/persona.ts";
const callableCapture = await import("../../../../tooling/src/floor/code-facts/call-returns.ts");

function read(repoRoot: string, body: string): ReturnType<typeof runPolicyPass> {
  const root = join(repoRoot, ".orb-partial-owner-control");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      paths: { "@orb/db": [join(root, "packages/db/src/index.ts")] },
    },
  });
  project.createSourceFile(
    join(root, SCHEMA),
    'import{sqliteTable,text}from"drizzle-orm/sqlite-core";export const personas=sqliteTable("personas",{id:text("id").primaryKey(),ownerId:text("owner_id")});export const chatParticipants=sqliteTable("chat_participants",{id:text("id").primaryKey(),chatId:text("chat_id"),userId:text("user_id")});',
  );
  project.createSourceFile(join(root, "packages/db/src/index.ts"), 'export*from"./schema/persona.ts";');
  project.createSourceFile(
    join(root, PATH),
    'import{and,eq,inArray,sql}from"drizzle-orm";import type{BaseSQLiteDatabase}from"drizzle-orm/sqlite-core";import{chatParticipants,personas}from"@orb/db";declare const db:BaseSQLiteDatabase<"async",void>;' +
      body,
  );
  return runPolicyPass({
    root,
    project,
    policies: [gate],
    knownPolicies: [gate],
    reviewedGrants: [],
    failOnWarnings: true,
    nativeTypeFacts: () => isolatedTypeFacts(project),
  });
}

test("the retained direct shapes qualify without calling generic callable capture", { timeout: policyProofRows(gate).length * 1000 }, () => {
  const capture = vi.spyOn(callableCapture, "observeCallReturns").mockImplementation(() => {
    throw new Error("unbounded callable capture entered");
  });
  try {
    expect(verifyPolicyProofs([gate])).toEqual([]);
    expect(capture).not.toHaveBeenCalled();
  } finally {
    capture.mockRestore();
  }
});

test("the direct consumer never constructs whole-callable observations", ({ repoRoot }) => {
  const capture = vi.spyOn(callableCapture, "observeCallReturns").mockImplementation(() => {
    throw new Error("whole-callable capture is forbidden for the partial owner reader");
  });
  try {
    const result = read(repoRoot, "export async function missing(id:string){return db.select().from(personas).where(eq(personas.id,id));}");
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(1);
    expect(capture).not.toHaveBeenCalled();
  } finally {
    capture.mockRestore();
  }
});

test("direct owner removal blocks, while helper, raw SQL, returned builders and relational readers remain anchored unknown", ({ repoRoot }) => {
  const result = read(
    repoRoot,
    `
export async function scoped(id:string,owner:string){return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,owner)));}
export async function missing(id:string){return db.select().from(personas).where(eq(personas.id,id));}
export async function helper(id:string){const byId=()=>eq(personas.id,id);return db.select().from(personas).where(byId());}
export function editable(id:string){return db.select().from(personas).where(eq(personas.id,id));}
export async function raw(id:string){return db.select().from(personas).where(sql\`1 = 1\`);}
`,
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings, JSON.stringify(result.policies[0]?.analysis)).toHaveLength(1);
  expect(result.authority.effectiveFindings[0]).toMatchObject({ token: "personas", line: 3 });
  expect(result.authority.verdict).toMatchObject({ errors: 1, warnings: 0, blocking: 1 });
  expect(result.policies[0]?.analysis?.supported).toBe(2);
  expect(result.policies[0]?.analysis?.unknown).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ file: PATH, line: 4, reason: expect.stringContaining("helper") }),
      expect.objectContaining({ file: PATH, line: 5, reason: expect.stringContaining("editable") }),
      expect.objectContaining({ file: PATH, line: 6, reason: expect.stringContaining("raw SQL") }),
    ]),
  );
});

test("a gap defers only its exact old waiver; it neither excuses a concrete finding nor hides another stale marker", ({ repoRoot }) => {
  const result = read(
    repoRoot,
    `
// @orb-waive owner-scoped-reads(personas): reviewed helper; ends when its analysis becomes supported.
export async function helper(id:string){const byId=()=>eq(personas.id,id);return db.select().from(personas).where(byId());}
export async function missing(id:string){return db.select().from(personas).where(eq(personas.id,id));}
// @orb-waive owner-scoped-reads(personas): this independent unused marker must still alarm.
export const unrelated=1;
`,
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.authority.waivedFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toHaveLength(1);
  expect(result.authority.authorityAlarms[0]?.message).toContain("cannot bind through comment trivia");
  expect(result.authority.authorityAlarms[0]?.message).toContain(`${PATH}:5:`);
});

test("unknown member-table anchors defer the exact whole authored waiver position", ({ repoRoot }) => {
  const result = read(
    repoRoot,
    `
declare const source:{table:typeof personas};
// @orb-waive owner-scoped-reads(source.table): private injected row source; ends when its scope is analyzed.
export async function indirect(id:string){return db.select().from(source.table).where(eq(personas.id,id));}
`,
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.waivedFindings).toEqual([]);
  expect(result.policies[0]?.analysis?.unknown).toEqual([expect.objectContaining({ token: "source.table" })]);
});

const COLUMN_VALUED = "owner term is valued by a column";
const OPAQUE_FILTER = "filter contains a helper, SQL carrier, alias or unsupported predicate";

type OwnerAnalysis = NonNullable<ReturnType<typeof runPolicyPass>["policies"][number]["analysis"]>;

function unknownOnly(repoRoot: string, body: string): OwnerAnalysis {
  const result = read(repoRoot, body);
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  const analysis = result.policies[0]?.analysis;
  if (analysis === undefined) {
    throw new Error("owner-read analysis coverage is missing");
  }
  return analysis;
}

// Each owner value a lexical check cannot pin is UNKNOWN; an identical-column or seat-valued owner is never a scoped read.
test("a const column alias and a column ternary branch leave the by-id read UNKNOWN", ({ repoRoot }) => {
  const alias = unknownOnly(
    repoRoot,
    "\nexport async function alias(id:string){const other=personas.ownerId;return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,other)));}",
  );
  expect(alias).toEqual({ supported: 0, unknown: [expect.objectContaining({ line: 2, token: "personas", reason: expect.stringContaining(COLUMN_VALUED) })] });
  const branch = unknownOnly(
    repoRoot,
    "\nexport async function choose(id:string,owner:string,flag:boolean){return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,flag?owner:personas.ownerId)));}",
  );
  expect(branch).toEqual({ supported: 0, unknown: [expect.objectContaining({ line: 2, token: "personas", reason: expect.stringContaining(COLUMN_VALUED) })] });
});

test("P01: a hoisted const subselect owner value is UNKNOWN, not a scoped read", ({ repoRoot }) => {
  const analysis = unknownOnly(
    repoRoot,
    "\nexport async function seats(personaId:string){const seatOwners=db.select({u:chatParticipants.userId}).from(chatParticipants);return db.select().from(personas).where(and(eq(personas.id,personaId),inArray(personas.ownerId,seatOwners))).limit(1);}",
  );
  expect(analysis.supported).toBe(0);
  expect(analysis.unknown).toEqual([
    expect.objectContaining({ line: 2, token: "chatParticipants", reason: expect.stringContaining("builder is stored") }),
    expect.objectContaining({ line: 2, token: "personas", reason: OPAQUE_FILTER }),
  ]);
});

test("P02: a join owned only by a const seat column is UNKNOWN, not UNJOINED or scoped", ({ repoRoot }) => {
  const analysis = unknownOnly(
    repoRoot,
    "\nexport async function seat(personaId:string){const seatUser=chatParticipants.userId;return db.select().from(chatParticipants).innerJoin(personas,and(eq(personas.ownerId,seatUser),eq(personas.id,personaId))).limit(1);}",
  );
  expect(analysis.supported).toBe(1);
  expect(analysis.unknown).toEqual([expect.objectContaining({ line: 2, token: "personas", reason: expect.stringContaining(COLUMN_VALUED) })]);
});

test("a by-id read whose owner term is another table's column is UNKNOWN", ({ repoRoot }) => {
  const analysis = unknownOnly(
    repoRoot,
    "\nexport async function hosted(id:string,chatId:string){return db.select().from(personas).innerJoin(chatParticipants,eq(chatParticipants.chatId,chatId)).where(and(eq(personas.id,id),eq(personas.ownerId,chatParticipants.userId)));}",
  );
  expect(analysis.supported).toBe(1);
  expect(analysis.unknown).toEqual([expect.objectContaining({ line: 2, token: "personas", reason: expect.stringContaining(COLUMN_VALUED) })]);
});

test("a rejecting post-fetch owner compare scopes a by-id read; a logging-only compare does not", ({ repoRoot }) => {
  const result = read(
    repoRoot,
    `
export async function owned(id:string,ownerId:string){const rows=await db.select({ownerId:personas.ownerId}).from(personas).where(eq(personas.id,id));if(rows[0]?.ownerId!==ownerId){throw new Error("not found");}}
export async function leaked(id:string,ownerId:string){const rows=await db.select().from(personas).where(eq(personas.id,id));if(rows[0]?.ownerId!==ownerId){console.log("mismatch");}return rows[0];}
`,
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ token, line }) => ({ token, line }))).toEqual([{ token: "personas", line: 3 }]);
  expect(result.policies[0]?.analysis).toEqual({ supported: 2, unknown: [] });
});

// The same binding rule keeps parameter data, destructured parameter data and a fetched row's member plain owner values.
test("parameter, destructured parameter and fetched-row owner values stay supported", ({ repoRoot }) => {
  const data = read(
    repoRoot,
    `
export async function fromParameter(id:string,{ownerId}:{ownerId:string}){return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,ownerId)));}
export async function fromPrincipal(id:string,principal:{userId:string}){const{userId}=principal;return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,userId)));}
export async function fromRow(id:string){const[seat]=await db.select({userId:chatParticipants.userId}).from(chatParticipants).where(eq(chatParticipants.id,id));if(seat===undefined){return;}return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,seat.userId)));}
`,
  );
  expect(data.authority.effectiveFindings).toEqual([]);
  expect(data.policies[0]?.analysis).toEqual({ supported: 4, unknown: [] });
});

// Each shape reads owner_id = owner_id through a binding; only a parameter or fetched data is a plain owner value.
function unknownShapes(
  repoRoot: string,
  shapes: readonly { readonly body: string; readonly reason: string }[],
): { readonly actual: readonly OwnerAnalysis[]; readonly expected: readonly OwnerAnalysis[] } {
  return {
    actual: shapes.map(({ body }) => unknownOnly(repoRoot, `\n${body}`)),
    expected: shapes.map(({ reason }) => ({
      supported: 0,
      unknown: [expect.objectContaining({ line: 2, token: "personas", reason: expect.stringContaining(reason) })],
    })),
  };
}

test("table destructuring, a destructured array and a destructured loop element are UNKNOWN owner values", ({ repoRoot }) => {
  const { actual, expected } = unknownShapes(repoRoot, [
    {
      body: "export async function pattern(id:string){const{ownerId:own}=personas;return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,own)));}",
      reason: COLUMN_VALUED,
    },
    {
      body: "export async function element(id:string){const[t]=[personas];return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,t.ownerId)));}",
      reason: OPAQUE_FILTER,
    },
    {
      body: "export async function loop(id:string){for(const{ownerId:own}of[personas]){return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,own)));}return undefined;}",
      reason: OPAQUE_FILTER,
    },
  ]);
  expect(actual).toEqual(expected);
});

test("object and conditional table holders are UNKNOWN owner values", ({ repoRoot }) => {
  const { actual, expected } = unknownShapes(repoRoot, [
    {
      body: "export async function holder(id:string){const t={ownerId:personas.ownerId};return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,t.ownerId)));}",
      reason: OPAQUE_FILTER,
    },
    {
      body: "export async function choose(id:string,flag:boolean){const t=flag?personas:personas;return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,t.ownerId)));}",
      reason: OPAQUE_FILTER,
    },
  ]);
  expect(actual).toEqual(expected);
});

// A call or await handed a table may return it; only an awaited query builder yields data rows.
const PICK = "function pick<T>(value:T):T{return value;}";
const launderedVerdict = { supported: 0, unknown: [expect.objectContaining({ line: 2, token: "personas", reason: OPAQUE_FILTER })] };

test("an awaited table or an awaited table carrier is an UNKNOWN owner holder", ({ repoRoot }) => {
  const shapes = [
    "export async function awaited(id:string){const t=await personas;return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,t.ownerId)));}",
    "export async function awaitedPattern(id:string){const{ownerId:own}=await personas;return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,own)));}",
    "export async function settled(id:string){const[t]=await Promise.all([personas]);return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,t.ownerId)));}",
  ];
  expect(shapes.map((body) => unknownOnly(repoRoot, `\n${body}`))).toEqual(shapes.map(() => launderedVerdict));
});

test("a call handed a table as receiver or argument is an UNKNOWN owner holder", ({ repoRoot }) => {
  const shapes = [
    `${PICK}export async function picked(id:string){const t=pick(personas);return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,t.ownerId)));}`,
    `${PICK}export async function pickedPattern(id:string){const{ownerId:own}=pick(personas);return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,own)));}`,
    "export async function element(id:string){const t=[personas].at(0)!;return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,t.ownerId)));}",
    `${PICK}export async function iterated(id:string){for(const t of pick([personas])){return db.select().from(personas).where(and(eq(personas.id,id),eq(personas.ownerId,t.ownerId)));}return undefined;}`,
  ];
  expect(shapes.map((body) => unknownOnly(repoRoot, `\n${body}`))).toEqual(shapes.map(() => launderedVerdict));
});
