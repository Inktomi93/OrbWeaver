import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, plantLink, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Project, SourceFile } from "ts-morph";
import { gate as ownership } from "../../../../tooling/src/verify/gates/own-tables-only.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SUBJECT = "packages/server/src/domain/connection/persistence/__native-ownership.ts";

interface NativeProgram {
  readonly project: Project;
  readonly source: SourceFile;
}
async function nativeProgram(
  { plantedTree, repoRoot }: Pick<ToolFixtures, "plantedTree" | "repoRoot">,
  body: string,
  files: Readonly<Record<string, string>> = {},
): Promise<NativeProgram> {
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    "tsconfig.json": JSON.stringify({ extends: join(repoRoot, "tsconfig.world-node.json"), files: ["reset.d.ts", "platform.d.ts"], include: ["consumer.ts"] }),
    "reset.d.ts": readFileSync(join(repoRoot, "reset.d.ts"), "utf8"),
    "platform.d.ts": readFileSync(join(repoRoot, "platform.d.ts"), "utf8"),
    "consumer.ts": body,
    ...files,
  });
  plantLink(root, "node_modules", join(repoRoot, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const world = createSemanticWorkspace({ root }).program("tsconfig.json");
  if (world === undefined) {
    throw new Error("the native ownership compiler world was not admitted");
  }
  const project = world.project();
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  const source = project.createSourceFile(join(repoRoot, SUBJECT), body);
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(join(repoRoot, dirname(SUBJECT), name), content);
  }
  for (const file of project.getSourceFiles().filter((candidate) => candidate.getFilePath().startsWith(`${root}/`))) {
    file.forget();
  }
  project.addSourceFileAtPath(join(repoRoot, "reset.d.ts"));
  project.addSourceFileAtPath(join(repoRoot, "platform.d.ts"));
  return { project, source };
}

function ownershipPass(root: string, project: Project): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [ownership],
    policies: [ownership],
    root,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("real native DB bound writes are owned even when the receiver is injected, while borrowed local members remain unrelated", {
  timeout: scaledBudget(60_000),
}, async ({ plantedTree, repoRoot }) => {
  const { project, source } = await nativeProgram(
    { plantedTree, repoRoot },
    `import {createDb,closeDb,userSettings,type Db} from "@orb/db";
export async function factory(){const db=await createDb(":memory:");try{const insert=db.insert.bind(db);return insert(userSettings);}finally{closeDb(db);}}
export function injected(db:Db){const insert=db.insert.bind(db);return insert(userSettings);}
export function prefix(db:Db){const insert=db.insert.bind(db,userSettings);return insert();}
export function call(db:Db){return db.insert.call(db,userSettings);}
export function apply(db:Db){return db.insert.apply(db,[userSettings]);}
export function direct(db:Db){return db.insert(userSettings);}
export function local(db:{insert:(table:object)=>void}){const insert=db.insert.bind(db);return insert(userSettings);}
export function borrowed(db:{insert:Db["insert"]}){const insert=db.insert.bind(db);return insert(userSettings);}
export function written(db:Db,other:Db){const insert=db.insert.bind(db);db=other;return insert(userSettings);}
import {table as external} from "./alias.ts"; export function crossFile(db:Db){const insert=db.insert.bind(db);return insert(external);}
export function tableAlias(db:Db){const table=userSettings;const insert=db.insert.bind(db);return insert(table);}
`,
    { "alias.ts": 'import {userSettings} from "@orb/db"; export const table=userSettings;' },
  );
  const result = ownershipPass(repoRoot, project);
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  const writes = result.authority.effectiveFindings.filter((finding) => finding.message?.includes("cross-domain WRITE") === true && finding.file === SUBJECT);
  expect(writes.map((finding) => finding.line)).toEqual([2, 3, 4, 5, 6, 7, 10, 11, 12]);
  const original = source.getFullText();
  source.addStatements('export function opaque(db:Db,args:Parameters<Db["insert"]>){return db.insert.apply(db,args);}');
  const refused = ownershipPass(repoRoot, project);
  expect(refused.toolErrors.some((error) => error.message.includes("cannot establish native write arguments"))).toBe(true);
  expect(refused.authority.withheldPolicyIds).toEqual([ownership.id]);
  for (const unsupported of [
    "export function mutableTable(db:Db){let table=userSettings;return db.insert(table);}",
    "export function opaqueTable(db:Db,table:typeof userSettings){return db.insert(table);}",
    "declare function escapedTable():typeof userSettings;export function escaped(db:Db){return db.insert(escapedTable());}",
    "export function alternative(db:Db,flag:boolean,opaque:typeof userSettings){return db.insert(flag?userSettings:opaque);}",
  ]) {
    source.replaceWithText(original + unsupported);
    const unsupportedTable = ownershipPass(repoRoot, project);
    expect(unsupportedTable.toolErrors.some((error) => error.message.includes("cannot establish"))).toBe(true);
    expect(unsupportedTable.authority.withheldPolicyIds).toEqual([ownership.id]);
  }
});

test("SDK persistence belongs to connection without granting chat the backend's durable table", { timeout: scaledBudget(20_000) }, async ({
  plantedTree,
  repoRoot,
}) => {
  const { project } = await nativeProgram(
    { plantedTree, repoRoot },
    `import {sessionEntries,type Db} from "@orb/db";
export function demote(db:Db){return db.update(sessionEntries);}
export function insert(db:Db){return db.insert(sessionEntries);}
export function promote(db:Db){return db.update(sessionEntries);}
`,
  );
  const foreign = "packages/server/src/domain/chat/persistence/__native-sdk-foreign.ts";
  project.createSourceFile(
    join(repoRoot, foreign),
    'import {sessionEntries,type Db} from "@orb/db"; export function write(db:Db){return db.insert(sessionEntries);}',
  );
  const result = ownershipPass(repoRoot, project);
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  const writes = result.authority.effectiveFindings.filter((finding) => finding.message?.includes("cross-domain WRITE") === true);
  expect(writes.filter((finding) => finding.file === SUBJECT)).toEqual([]);
  expect(writes.filter((finding) => finding.file === foreign).map((finding) => finding.token)).toEqual(["sessionEntries"]);
});
