// Private role decoding is a native module boundary, independently of imported spelling.
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const SERVER = "packages/server/src";
const DECODER = `${SERVER}/primitives/role-data/decode/index.ts`;
const FOREIGN = `${SERVER}/domain/chat/contract/foreign-role.ts`;
const RULE = "role-data-private-decoder";

test.for([
  { name: "direct decoder", body: "import { userRoleValue } from SOURCE; export const read = userRoleValue;", blocked: true },
  { name: "renamed decoder", body: "import { userRoleValue as local } from SOURCE; export { local };", blocked: true },
  { name: "computed namespace", body: 'import * as data from SOURCE; const key="userRoleValue"; export const read=data[key];', blocked: true },
  { name: "destructured namespace", body: "import * as data from SOURCE; const { userRoleValue: read }=data; export { read };", blocked: true },
  { name: "reexport barrel", body: "export { userRoleValue as read } from SOURCE;", barrel: true, blocked: true },
  { name: "dynamic decoder", body: "export const read=import(SOURCE).then(data=>data.userRoleValue);", blocked: true },
  { name: "generated source", body: "import { userRoleValue } from SOURCE; export const read=userRoleValue;", generated: true, blocked: true },
  { name: "canonical kernel", body: "import { userRoleValue } from SOURCE; export const can=userRoleValue;", kernel: true, blocked: false },
  {
    name: "registry escape",
    target: `${SERVER}/primitives/role-data/registry.ts`,
    rule: "role-data-private-registry",
    body: "import { userRoleCodes } from SOURCE; export const read=userRoleCodes;",
    blocked: true,
  },
  {
    name: "capture escape",
    target: `${SERVER}/primitives/role-data/index.ts`,
    rule: "role-data-capture-owners",
    body: "import { captureUserRole as mint } from SOURCE; export const read=mint;",
    blocked: true,
  },
  {
    name: "wire output escape",
    target: `${SERVER}/transport/trpc/role-output.ts`,
    rule: "role-data-wire-output-owners",
    body: "export { viewerViewSchema as read } from SOURCE;",
    blocked: true,
  },
  {
    name: "storage capture owner",
    target: `${SERVER}/primitives/role-data/index.ts`,
    rule: "role-data-capture-owners",
    owner: "domain/sessions/verbs/validate.ts",
    body: "import { captureUserRole } from SOURCE; export const read=captureUserRole;",
    blocked: false,
  },
  {
    name: "actual wire owner",
    target: `${SERVER}/transport/trpc/role-output.ts`,
    rule: "role-data-wire-output-owners",
    owner: "transport/trpc/routers/sessions.ts",
    body: "import { viewerViewSchema } from SOURCE; export const read=viewerViewSchema;",
    blocked: false,
  },
  {
    name: "foreign local decoder",
    body: "import { userRoleValue } from FOREIGN; const data={userRoleValue:1}; export const read=[data.userRoleValue,userRoleValue];",
    blocked: false,
  },
] as const)("the native role decoder boundary judges $name", async (row, { plantedTree, repoRoot }) => {
  const entry =
    "owner" in row
      ? `${SERVER}/${row.owner}`
      : `${SERVER}/domain/${"kernel" in row ? "admin/guard.ts" : `chat/${"barrel" in row ? "substrate" : "verbs"}/probe${"generated" in row ? ".gen" : ""}.ts`}`;
  const target = "target" in row ? row.target : DECODER;
  const source = JSON.stringify(relative(dirname(entry), target));
  const root = await plantedTree({
    [DECODER]: "export const userRoleValue=(role:string)=>role;",
    [`${SERVER}/primitives/role-data/registry.ts`]: "export const userRoleCodes=new WeakMap();",
    [`${SERVER}/primitives/role-data/index.ts`]: "export const captureUserRole=(role:string)=>Object.freeze({});",
    [`${SERVER}/transport/trpc/role-output.ts`]: "export const viewerViewSchema={};",
    [FOREIGN]: 'export const userRoleValue="foreign";',
    [entry]: row.body.replaceAll("SOURCE", source).replaceAll("FOREIGN", JSON.stringify(relative(dirname(entry), FOREIGN))),
  });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [entry, "--config", join(repoRoot, ".dependency-cruiser.ts"), "--output-type", "err-long"],
    { cwd: root },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  expect(output).not.toContain("not-to-unresolvable");
  expect(result.status === 0, output).toBe(!row.blocked);
  expect(output.includes("rule" in row ? row.rule : RULE), output).toBe(row.blocked);
  expect(output).toContain(row.blocked ? entry : "no dependency violations found");
});
