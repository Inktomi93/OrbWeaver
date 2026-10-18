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
    'import{sqliteTable,text}from"drizzle-orm/sqlite-core";export const personas=sqliteTable("personas",{id:text("id").primaryKey(),ownerId:text("owner_id")});',
  );
  project.createSourceFile(join(root, "packages/db/src/index.ts"), 'export*from"./schema/persona.ts";');
  project.createSourceFile(
    join(root, PATH),
    'import{and,eq,sql}from"drizzle-orm";import type{BaseSQLiteDatabase}from"drizzle-orm/sqlite-core";import{personas}from"@orb/db";declare const db:BaseSQLiteDatabase<"async",void>;' +
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
