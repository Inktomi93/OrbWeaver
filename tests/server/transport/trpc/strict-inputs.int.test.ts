// @subject packages/server/src/transport/trpc/router.ts
// @subject packages/kit/src/zod-schema/index.ts
import { streamConnectInputSchema } from "@orb/contracts/stream";
import { themeOverrideSchema } from "@orb/contracts/theme";
import { strictInput } from "@orb/kit/zod-schema";
import { appRouter } from "@orb/server/transport/trpc";
import { zodDefinition, zodSchemaChildren } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { z } from "zod";

// Object keys and union or tuple positions name a step; a wrapper (optional, nullable, ...) adds none.
function pathStep(kind: string, key: string | undefined, index: number): string {
  if (kind === "object") {
    return `.${key ?? "*"}`;
  }
  if (kind === "array") {
    return "[]";
  }
  return kind === "union" || kind === "tuple" ? `[${index}]` : "";
}

// Every plain (strip-mode) object a parser reaches outside a `catch`, by path. A strict or loose object declares
// its unknown-key policy; strip drops a key silently. Below a `catch` no refusal can surface, so strip is the
// smaller loss there and the walk stops.
function stripObjectPaths(root: z.core.$ZodType): readonly string[] {
  const found: string[] = [];
  const seen = new Set<z.core.$ZodType>();
  const visit = (schema: z.core.$ZodType, path: string): void => {
    if (seen.has(schema)) {
      return;
    }
    seen.add(schema);
    const def = zodDefinition(schema);
    if (def.type === "catch") {
      return;
    }
    if (def.type === "object" && def.catchall === undefined) {
      found.push(path === "" ? "$" : path);
    }
    const keys = def.type === "object" ? Object.keys(def.shape) : [];
    zodSchemaChildren(schema).forEach((child, index) => {
      visit(child, `${path}${pathStep(def.type, keys[index], index)}`);
    });
  };
  visit(root, "");
  return found;
}

test("every mounted procedure input refuses an undeclared key at every object it reaches", () => {
  const procedures = Object.entries(appRouter._def.procedures);
  expect(procedures.length).toBeGreaterThan(0);
  let parsers = 0;
  const strip: string[] = [];
  for (const [name, procedure] of procedures) {
    if (typeof procedure !== "function") {
      throw new Error("the native procedure table contains an unresolved non-procedure entry");
    }
    for (const parser of procedure._def.inputs) {
      if (!(parser instanceof z.core.$ZodType)) {
        throw new Error(`${name}: the mounted input parser is not a zod schema`);
      }
      parsers++;
      strip.push(...stripObjectPaths(parser).map((path) => `${name} ${path}`));
    }
  }
  expect(parsers).toBeGreaterThan(0);
  expect(strip).toEqual([]);
});

test.for([
  { name: "a plain top-level object", schema: z.object({ id: z.string() }), paths: ["$"] },
  { name: "a plain object nested in a strict one", schema: z.strictObject({ inner: z.object({ a: z.string() }).optional() }), paths: [".inner"] },
  {
    name: "a plain discriminated-union arm",
    schema: z.discriminatedUnion("k", [z.strictObject({ k: z.literal("a") }), z.object({ k: z.literal("b") })]),
    paths: ["[1]"],
  },
  { name: "a plain array element", schema: z.strictObject({ rows: z.array(z.object({ a: z.string() })) }), paths: [".rows[]"] },
  { name: "a strict tree", schema: z.strictObject({ inner: z.strictObject({ a: z.string() }) }), paths: [] },
  { name: "a declared loose object", schema: z.looseObject({ auth: z.string() }), paths: [] },
  { name: "a plain object below a catch", schema: z.strictObject({ inner: z.object({ a: z.string() }).catch({ a: "" }) }), paths: [] },
])("the strip walk reports $name", ({ schema, paths }) => {
  expect(stripObjectPaths(schema)).toEqual(paths);
});

test("the strict twin of a stored schema reaches no strip object and parses the same values", () => {
  const stored = z.strictObject({ name: z.string(), theme: themeOverrideSchema.nullable().optional() });
  expect(stripObjectPaths(stored)).toEqual([".theme"]);
  const twin = strictInput(stored);
  expect(stripObjectPaths(twin)).toEqual([]);
  const value = { name: "Lantern", theme: { background: "#112233" } };
  expect(twin.parse(value)).toEqual(stored.parse(value));
});

test("the socket input admits the resume token the subscription client adds on reconnect", () => {
  expect(streamConnectInputSchema.safeParse({ socketId: "tab-1", lastEventId: "41" }).success).toBe(true);
  expect(streamConnectInputSchema.safeParse({ socketId: "tab-1", resumeFrom: "41" }).success).toBe(false);
});

test("the real caller refuses an undeclared key on an input-only schema and on a shared stored schema", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  // Non-fresh objects: typecheck admits the extra key, exactly as a hand-declared client payload type does.
  const retiredKey = { limit: 5, retired: true };
  await expect(caller.chat.listChats(retiredKey)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(caller.chat.listChats({ limit: 5 })).resolves.toBeDefined();
  // The infinite-query client adds the page direction to a paged input; the input declares it and drops it.
  const firstPage = await caller.chat.listChats({ limit: 5 });
  await expect(caller.chat.listChats({ limit: 5, direction: "forward" })).resolves.toEqual(firstPage);

  const card = await caller.character.create({ input: { handle: "lantern", name: "Lantern", description: "" } });
  const theme = { background: "#112233", retiredToken: "#000000" };
  await expect(caller.character.update({ characterId: card.id, input: { themeOverride: theme } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  // The stored read of the same schema still strips the key rather than degrading the whole row.
  expect(themeOverrideSchema.parse(theme)).toEqual({ background: "#112233" });
  const updated = await caller.character.update({ characterId: card.id, input: { themeOverride: { background: "#112233" } } });
  expect(updated.themeOverride).toEqual({ background: "#112233" });
});
