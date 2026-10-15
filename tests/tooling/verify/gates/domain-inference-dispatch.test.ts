// @subject tooling/src/verify/lib/type-member-origin-graph.ts
import { readFileSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Project, SourceFile } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/domain-inference-dispatch.ts";
import { gate as ownership } from "../../../../tooling/src/verify/gates/own-tables-only.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { resolveScalarTypeOrigins, resolveTypeValueOrigins } from "../../../../tooling/src/verify/lib/type-member-origin.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
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
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
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

test("inference-origin comparisons retain aliases, near misses and opaque refusal", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("foreign persistence writes retain the complete ownership policy's bounded controls", { timeout: scaledBudget(15_000) }, () => {
  expect(verifyPolicyProofs([ownership])).toEqual([]);
});

test("real inference members and finite authored scalar projections retain identity without granting coincident unions", {
  timeout: scaledBudget(20_000),
}, async ({ plantedTree, repoRoot }) => {
  const { project, source } = await nativeProgram(
    { plantedTree, repoRoot },
    `import type { ProviderDef, UserConnection, ResolvedConnectionView, ChatApi, Wire } from "@orb/contracts/inference";
declare const provider: ProviderDef;
declare const connection: UserConnection;
declare const resolved: ResolvedConnectionView;
if (provider.wire === "local-light") {}
const { wire: renamed } = provider; if (renamed === "local-light") {}
if (connection.api === "auto") {}
const key = "api"; if (resolved?.[key] === "agent-sdk") {}
type Alias = ChatApi | null; export declare const alias: Alias; if (alias === "agent-sdk") {}
type Maybe<T> = T | null; export declare const generic: Maybe<ChatApi>; if (generic === "agent-sdk") {}
export declare const selected: ResolvedConnectionView["api"]; if (selected === "agent-sdk") {}
type Phantom<_T> = "agent-sdk" | "anthropic-messages" | "google-generative-ai" | "chat-completions";
export declare const phantom: Phantom<ChatApi>; if (phantom === "agent-sdk") {}
export declare const propertyKey: keyof { api: ChatApi }; if (propertyKey === "api") {}
type Coincident = "agent-sdk" | "anthropic-messages" | "google-generative-ai" | "chat-completions";
export declare const coincident: Coincident; if (coincident === "agent-sdk") {}
const unrelated = { api: "agent-sdk" }; if (unrelated.api === "agent-sdk") {}
export declare const opaque: ChatApi | unknown;
export declare function readAxis(): ChatApi | null; const returned = readAxis(); if (returned === "agent-sdk") {}
declare function unrelatedRead(): Coincident; if (unrelatedRead() === "agent-sdk") {}
export function shadow(){function readAxis():Coincident{return "agent-sdk";} if(readAxis() === "agent-sdk") {}}
export function intrinsicPresence(row:ProviderDef){if(row.wire !== undefined){}}
export function shadowedPresence(row:ProviderDef,undefined:Wire){if(row.wire === undefined){}}
`,
  );
  expect(source.getVariableDeclarationOrThrow("provider").getType().isAny()).toBe(false);
  const origins = (name: string): ReturnType<typeof resolveScalarTypeOrigins> =>
    resolveScalarTypeOrigins(source.getVariableDeclarationOrThrow(name).getTypeNodeOrThrow());
  for (const name of ["alias", "generic", "selected"]) {
    expect(origins(name).some((fact) => fact.kind === "resolved" && fact.value.name === "ChatApi")).toBe(true);
  }
  for (const name of ["phantom", "propertyKey", "coincident"]) {
    expect(origins(name).some((fact) => fact.kind === "resolved" && fact.value.name === "ChatApi")).toBe(false);
  }
  expect(
    origins("opaque").some(
      (fact) => fact.kind === "unresolved" && fact.trace.declarations.some((declaration) => declaration.getText().includes("type ChatApi")),
    ),
  ).toBe(true);
  expect(
    resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("alias").getTypeNodeOrThrow()).map((fact) =>
      fact.kind === "resolved" ? fact.value.name : fact.reason,
    ),
  ).toEqual(["Alias"]);
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings.map((finding) => finding.line)).toEqual([5, 6, 7, 8, 9, 10, 11, 19, 23]);
  const original = source.getFullText();
  source.addStatements('if (opaque === "agent-sdk") {}');
  const refused = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });
  expect(refused.toolErrors.some((error) => error.message.includes("cannot establish an opaque inference comparison"))).toBe(true);
  expect(refused.authority.withheldPolicyIds).toEqual([gate.id]);
  for (const unsupported of [
    'const unannotated = () => provider.wire; if (unannotated() === "local-light") {}',
    'const otherRead = (): Coincident => "agent-sdk"; let mutable = unrelatedRead; mutable = otherRead; if (mutable() === "agent-sdk") {}',
  ]) {
    source.replaceWithText(original + unsupported);
    const unsupportedCall = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });
    expect(unsupportedCall.toolErrors.some((error) => error.message.includes("cannot establish an opaque inference comparison"))).toBe(true);
    expect(unsupportedCall.authority.withheldPolicyIds).toEqual([gate.id]);
  }
});

test("real native DB bound writes are owned even when the receiver is injected, while borrowed local members remain unrelated", {
  timeout: scaledBudget(20_000),
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
  const result = runPolicyPass({ knownPolicies: [ownership], policies: [ownership], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  const writes = result.authority.effectiveFindings.filter((finding) => finding.message?.includes("cross-domain WRITE") === true && finding.file === SUBJECT);
  expect(writes.map((finding) => finding.line)).toEqual([2, 3, 4, 5, 6, 7, 10, 11, 12]);
  const original = source.getFullText();
  source.addStatements('export function opaque(db:Db,args:Parameters<Db["insert"]>){return db.insert.apply(db,args);}');
  const refused = runPolicyPass({ knownPolicies: [ownership], policies: [ownership], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });
  expect(refused.toolErrors.some((error) => error.message.includes("cannot establish native write arguments"))).toBe(true);
  expect(refused.authority.withheldPolicyIds).toEqual([ownership.id]);
  for (const unsupported of [
    "export function mutableTable(db:Db){let table=userSettings;return db.insert(table);}",
    "export function opaqueTable(db:Db,table:typeof userSettings){return db.insert(table);}",
    "declare function escapedTable():typeof userSettings;export function escaped(db:Db){return db.insert(escapedTable());}",
    "export function alternative(db:Db,flag:boolean,opaque:typeof userSettings){return db.insert(flag?userSettings:opaque);}",
  ]) {
    source.replaceWithText(original + unsupported);
    const unsupportedTable = runPolicyPass({
      knownPolicies: [ownership],
      policies: [ownership],
      root: repoRoot,
      project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
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
  const result = runPolicyPass({ knownPolicies: [ownership], policies: [ownership], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  const writes = result.authority.effectiveFindings.filter((finding) => finding.message?.includes("cross-domain WRITE") === true);
  expect(writes.filter((finding) => finding.file === SUBJECT)).toEqual([]);
  expect(writes.filter((finding) => finding.file === foreign).map((finding) => finding.token)).toEqual(["sessionEntries"]);
});
