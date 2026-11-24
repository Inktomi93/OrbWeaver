// A value handed to a member the HTTP framework declares on its request context, where the call's result is the
// platform's `Response`, is sent over http, whatever the handler names its context. A framework helper that is no
// context member, and a context member that returns no response, keep the value the framework's own.
import { expect, test } from "@orb/testkit/tooling";
import type { FieldsReport } from "../../../tooling/src/unwired/index.ts";
import { fieldsScan, libraryModule, NODE_TYPES } from "./_planted.ts";

const HONO = libraryModule(
  [
    '/// <reference types="node" />',
    "export declare class Context { json<T>(object: T): Response & { readonly typed: T }; set(key: string, value: object): void }",
    "export declare function readCookie(c: Context, carrier: Readonly<Record<string, string>>): string;",
  ],
  "hono",
);

// Member names carry a zq prefix so the literal stage of a real-tree scan never matches this file.
const ROUTES = [
  '/// <reference types="node" />',
  'import type { Context } from "hono";',
  'import { readCookie } from "hono";',
  "interface Replied { readonly zqReplied: string }",
  'export const handler = (ctx: Context): Response => ctx.json({ zqReplied: "r" } satisfies Replied);',
  "interface Carried { readonly zqCarried: string }",
  'export const cookie = (ctx: Context): string => readCookie(ctx, { zqCarried: "c" } satisfies Carried);',
  "interface Stored { readonly zqStored: string }",
  'export const stash = (ctx: Context): void => { ctx.set("k", { zqStored: "s" } satisfies Stored); };',
].join("\n");

const line = ({ home, member, sent }: FieldsReport["unwired"][number]): string =>
  [`${home}.${member}`, ...sent.map((send) => send.split(" ").toSpliced(1, 1).join(" "))].join(" ");

test("a context member that answers with a Response sends over http; other framework members stay the framework's", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await fieldsScan(plantedTree, { ...HONO, ...NODE_TYPES, "packages/server/src/entry/http/routes.ts": ROUTES });
  expect(report.unwired.map(line).toSorted()).toEqual(["Carried.zqCarried dependency hono", "Replied.zqReplied http", "Stored.zqStored dependency hono"]);
});
