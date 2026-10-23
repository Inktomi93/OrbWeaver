// The existing native direct-import boundary judges resolved bus-module edges, not identifier spelling.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const CONTRACTS = "packages/contracts/src";
const RULE = "bus-contract-no-credentials";

test.for([
  {
    name: "ambient bus import",
    home: "chat",
    source: 'declare module "virtual-bus" { import type { SecretCarrier } from "../credentials/index.ts"; export type Event=SecretCarrier; }',
    blocked: true,
  },
  {
    name: "chat alias",
    home: "chat",
    source: 'import type { SecretCarrier as Local } from "../credentials/index.ts"; export type Event = Local;',
    blocked: true,
  },
  { name: "user namespace", home: "user-bus", source: 'import * as data from "../credentials/index.ts"; export const field=data["secret"];', blocked: true },
  {
    name: "notification destructuring",
    home: "notifications",
    source: 'import * as data from "../credentials/index.ts"; const {secret: local}=data; export {local};',
    blocked: true,
  },
  { name: "event reexport", home: "events", source: 'export type { SecretCarrier as Event } from "../credentials/index.ts";', blocked: true },
  {
    name: "world-info dynamic import",
    home: "world-info",
    source: 'export const value=import("../credentials/index.ts").then(data=>data.secret);',
    blocked: true,
  },
  {
    name: "RPG generated source",
    home: "rpg",
    generated: true,
    source: 'import type { SecretCarrier } from "../credentials/index.ts"; export type Event=SecretCarrier;',
    blocked: true,
  },
  {
    name: "automation declared source",
    home: "automation",
    declaration: true,
    source: 'import type { SecretCarrier } from "../credentials/index.ts"; export type Event=SecretCarrier;',
    blocked: true,
  },
  { name: "workload import", home: "workloads", source: 'import { secret } from "../credentials/index.ts"; export const value=secret;', blocked: true },
  { name: "bus barrel", home: "chat", source: 'export type { SecretCarrier as Event } from "./barrel.ts";', barrel: true, blocked: true },
  {
    name: "foreign carrier and local shadow",
    home: "chat",
    source: 'import type { SecretCarrier } from "../foreign/index.ts"; const data={secret:1}; export const value=data.secret; export type Event=SecretCarrier;',
    blocked: false,
  },
  {
    name: "safe identity module",
    home: "user-bus",
    source: 'import type { CredentialId } from "../foreign/index.ts"; export type Event={type:"changed"; credentialId?:CredentialId};',
    blocked: false,
  },
] as const)("the installed native bus import boundary judges $name", async (row, { plantedTree, repoRoot }) => {
  const entry = `${CONTRACTS}/${row.home}/probe${"generated" in row ? ".gen" : ""}${"declaration" in row ? ".d" : ""}.ts`;
  const root = await plantedTree({
    [`${CONTRACTS}/credentials/index.ts`]: 'export interface SecretCarrier { readonly apiKey: string; } export const secret="private";',
    [`${CONTRACTS}/foreign/index.ts`]: "export interface SecretCarrier { readonly count: number; } export type CredentialId=string;",
    [`${CONTRACTS}/chat/barrel.ts`]: "barrel" in row ? 'export type { SecretCarrier } from "../credentials/index.ts";' : "export {};",
    [entry]: row.source,
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
  expect(output.includes(RULE), output).toBe(row.blocked);
  const violatingPath = "barrel" in row ? `${CONTRACTS}/chat/barrel.ts` : entry;
  expect(output).toContain(row.blocked ? violatingPath : "no dependency violations found");
});
