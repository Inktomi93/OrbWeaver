// @subject packages/server/src/entry/compose/portability.ts
import { characterCardV3Schema, createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { cardImportResultSchema } from "@orb/contracts/import";
import { PORTABLE_IMPORT_ORDER, PORTABLE_KINDS } from "@orb/contracts/portability";
// biome-ignore lint/performance/noNamespaceImport: the census denominator is every native schema export, including future tables that named imports would omit.
import * as schema from "@orb/db/schema";
import { LIFECYCLE_DOORS, NON_PORTABLE_CANON, NON_PORTABLE_CLASSES, PORTABLE_CANON_TABLES } from "@orb/server/entry/compose";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";

function nativeTables(): ReadonlyMap<SQLiteTable, string> {
  const tables = new Map<SQLiteTable, string>();
  let declarations = 0;
  for (const [name, value] of Object.entries(schema)) {
    if (is(value, SQLiteTable)) {
      declarations += 1;
      tables.set(value, name);
    }
  }
  expect(tables.size).toBeGreaterThan(0);
  expect(tables.size).toBe(declarations);
  return tables;
}

test("the imported schema includes every native foreign-key table reachable from production tables", () => {
  const exported = nativeTables();
  const visited = new Set<SQLiteTable>();
  const pending = [...exported.keys()];
  const privateTables: string[] = [];
  for (let table = pending.pop(); table !== undefined; table = pending.pop()) {
    if (visited.has(table)) {
      continue;
    }
    visited.add(table);
    const config = getTableConfig(table);
    if (!exported.has(table)) {
      privateTables.push(config.name);
    }
    for (const key of config.foreignKeys) {
      pending.push(key.reference().foreignTable);
    }
  }
  expect(privateTables.toSorted()).toEqual([]);
});

test("every native owner_id table has one non-stale portability disposition", () => {
  const tables = nativeTables();
  const names = new Set(tables.values());
  const carried = PORTABLE_KINDS.flatMap((kind) => PORTABLE_CANON_TABLES[kind].map((table) => ({ kind, table })));
  const classified = Object.keys(NON_PORTABLE_CANON);
  const answered = [...carried.map(({ table }) => table), ...classified];
  expect(answered.filter((name) => !names.has(name))).toEqual([]);
  expect(answered.filter((name, index) => answered.indexOf(name) !== index)).toEqual([]);
  const uncovered = [...tables]
    .filter(([table]) => getTableConfig(table).columns.some((column) => column.name === "owner_id"))
    .map(([, name]) => name)
    .filter((name) => !answered.includes(name));
  expect(uncovered.toSorted()).toEqual([]);
  for (const row of Object.values(NON_PORTABLE_CANON)) {
    expect(NON_PORTABLE_CLASSES).toContain(row.classification);
    expect(row.why).toMatch(/\S/u);
    expect(row.why).toContain("Ends");
  }
  expect(NON_PORTABLE_CANON.userCredentials.classification).toBe("RULED-OUT");
  expect(carried.map(({ table }) => table)).not.toContain("userCredentials");
});

test("the production descriptor graph and import order each cover PortableKind exactly once", ({ app }) => {
  const kinds = [...PORTABLE_KINDS].sort();
  expect(app.portability.map(({ kind }) => kind).sort()).toEqual(kinds);
  expect([...PORTABLE_IMPORT_ORDER].sort()).toEqual(kinds);
  expect(Object.keys(PORTABLE_CANON_TABLES).sort()).toEqual(kinds);
  expect(Object.keys(LIFECYCLE_DOORS).sort()).toEqual(kinds);
});

test("every declared single-entity door is mounted on the native composed router or HTTP graph", ({ harness }) => {
  const procedures = harness.trpcProcedures;
  expect(procedures.size).toBeGreaterThan(0);
  expect(harness.http.routes.some(({ method, path }) => method === "ALL" && path === "/api/trpc/*")).toBe(true);
  const http = new Set(harness.http.routes.filter(({ method }) => method !== "ALL").map(({ method, path }) => `${method} ${path}`));
  expect(http.size).toBeGreaterThan(0);
  const doors = PORTABLE_KINDS.flatMap((kind) => {
    const row = LIFECYCLE_DOORS[kind];
    return [row.singleExport, row.singleImport];
  });
  const rulings = doors.filter((door) => "ruled" in door);
  const trpcDoors = doors.filter((door) => "transport" in door && door.transport === "trpc");
  const httpDoors = doors.filter((door) => "transport" in door && door.transport === "http");
  expect(rulings.filter((door) => door.ruled.trim().length === 0)).toEqual([]);
  expect(trpcDoors.filter((door) => !procedures.has(door.cite)).map((door) => door.cite)).toEqual([]);
  expect(httpDoors.filter((door) => !http.has(`${door.method} ${door.cite}`)).map((door) => `${door.method} ${door.cite}`)).toEqual([]);
});

test("the actual HTTP character doors download native owner bytes and isolate malformed reimports", async () => {
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const owner = await root.internalCallerFor(root.ownerId);
  const marker = "Portable HTTP owned canon";
  const character = await owner.character.create({ input: createCharacterSchema.parse({ handle: "native-portability", name: marker, description: marker }) });
  const path = LIFECYCLE_DOORS.character.singleExport.cite.replace(":characterId", character.id);
  const response = await root.http.request(`${path}?format=json`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  const file = await response.text();
  expect(characterCardV3Schema.parse(JSON.parse(file)).data.description).toBe(marker);
  const body = new FormData();
  body.append("file", new Blob([file], { type: "application/json" }), "owned.json");
  body.append("file", new Blob(["not a card"], { type: "application/json" }), "malformed.json");
  const imported = await root.http.request(LIFECYCLE_DOORS.character.singleImport.cite, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body });
  expect(imported.status).toBe(200);
  const outcome = cardImportResultSchema.parse(await imported.json());
  expect(outcome.imported.map(({ filename }) => filename)).toEqual(["owned.json"]);
  expect(outcome.failed.map(({ filename }) => filename)).toEqual(["malformed.json"]);
  expect(outcome.failed[0]?.error).toMatch(/\S/u);
  const importedCard = outcome.imported[0];
  if (importedCard === undefined) {
    throw new Error("the actual card import returned no imported character");
  }
  expect((await owner.character.get({ characterId: importedCard.characterId })).description).toBe(marker);
});
