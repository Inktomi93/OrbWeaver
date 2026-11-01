// The turn engine reaches request authority through no module edge: the real rule fires on a planted engine file.
import { expect, test } from "@orb/testkit/tooling";
import { cruiseRules, fires, unresolvable } from "./_native-cruise.ts";

const CHAT = "packages/server/src/domain/chat";
const RULE = "chat-engine-authority-context";

test.for([
  {
    name: "ambient authority import",
    source: 'declare module "virtual-engine" { import type { ChatContext } from "../context.ts"; export type Value=ChatContext; }',
    blocked: true,
  },
  { name: "type alias", source: 'import type { ChatContext as Runtime } from "../context.ts"; export type Value = Runtime;', blocked: true },
  { name: "contract context", source: 'import type { ChatContext as Runtime } from "../contract/context.ts"; export type Value = Runtime;', blocked: true },
  {
    name: "renamed barrel",
    source: 'import type { Runtime } from "../substrate/barrel.ts"; export type Value = Runtime;',
    barrel: 'export type { ChatContext as Runtime } from "../context.ts";',
    blocked: true,
  },
  {
    name: "foreign type and local shadow",
    source:
      'import type { Principal } from "../contract/wire.ts"; const bag = { Principal: 1 }; export const value = bag.Principal; export type Value = Principal;',
    blocked: false,
  },
  { name: "composition root", source: 'import type { ChatContext } from "./context.ts"; export type Value = ChatContext;', composition: true, blocked: false },
] as const)("the native engine import boundary judges $name", async (row, { plantedTree }) => {
  const entry = `${CHAT}/${"composition" in row ? "service.ts" : "engine/probe.ts"}`;
  const root = await plantedTree({
    [`${CHAT}/context.ts`]: 'export type { ChatContext } from "./contract/context.ts";',
    [`${CHAT}/contract/context.ts`]: "export interface ChatContext { readonly can: () => void; }",
    [`${CHAT}/contract/wire.ts`]: "export interface Principal { readonly wireVersion: number; }",
    [`${CHAT}/guard.ts`]: "export function requireHost() { throw new Error('host required'); }",
    [`${CHAT}/substrate/barrel.ts`]: "barrel" in row ? row.barrel : "export {};",
    [entry]: row.source,
  });
  const violations = await cruiseRules(root, [entry], [RULE]);
  expect(unresolvable(violations)).toEqual([]);
  expect(fires(violations, RULE, [entry])).toBe(row.blocked);
});
