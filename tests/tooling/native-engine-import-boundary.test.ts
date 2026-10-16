// The installed native import checker must preserve the engine boundary through real module edges.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const CHAT = "packages/server/src/domain/chat";
const RULE = "chat-engine-authority-context";

test.for([
  { name: "type alias", source: 'import type { ChatContext as Runtime } from "../context.ts"; export type Value = Runtime;', blocked: true },
  { name: "contract context", source: 'import type { ChatContext as Runtime } from "../contract/context.ts"; export type Value = Runtime;', blocked: true },
  {
    name: "renamed barrel",
    source: 'import type { Runtime } from "../substrate/barrel.ts"; export type Value = Runtime;',
    barrel: 'export type { ChatContext as Runtime } from "../context.ts";',
    blocked: true,
  },
  {
    name: "namespace computed guard",
    source: 'import * as guards from "../guard.ts"; const field = "requireHost"; export const check = guards[field];',
    blocked: true,
  },
  {
    name: "destructured guard alias",
    source: 'import * as guards from "../guard.ts"; const { requireHost: check } = guards; export { check };',
    blocked: true,
  },
  { name: "dynamic guard import", source: 'export const check = import("../guard.ts").then((guards) => guards.requireHost);', blocked: true },
  {
    name: "generated engine source",
    source: 'import type { ChatContext } from "../context.ts"; export type Value = ChatContext;',
    generated: true,
    blocked: true,
  },
  {
    name: "foreign type and local shadow",
    source:
      'import type { Principal } from "../contract/wire.ts"; const bag = { Principal: 1 }; export const value = bag.Principal; export type Value = Principal;',
    blocked: false,
  },
  { name: "composition root", source: 'import type { ChatContext } from "./context.ts"; export type Value = ChatContext;', composition: true, blocked: false },
] as const)("the native engine import boundary judges $name", async (row, { plantedTree, repoRoot }) => {
  const entry = `${CHAT}/${"composition" in row ? "service.ts" : `engine/probe${"generated" in row ? ".gen" : ""}.ts`}`;
  const root = await plantedTree({
    [`${CHAT}/context.ts`]: 'export type { ChatContext } from "./contract/context.ts";',
    [`${CHAT}/contract/context.ts`]: "export interface ChatContext { readonly can: () => void; }",
    [`${CHAT}/contract/wire.ts`]: "export interface Principal { readonly wireVersion: number; }",
    [`${CHAT}/guard.ts`]: "export function requireHost() { throw new Error('host required'); }",
    [`${CHAT}/substrate/barrel.ts`]: "barrel" in row ? row.barrel : "export {};",
    [entry]: row.source,
  });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [entry, "--config", join(repoRoot, ".dependency-cruiser.cjs"), "--output-type", "err-long"],
    { cwd: root },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  expect(output).not.toContain("not-to-unresolvable");
  expect(result.status === 0, output).toBe(!row.blocked);
  expect(output.includes(RULE), output).toBe(row.blocked);
  expect(output).toContain(row.blocked ? entry : "no dependency violations found");
});
