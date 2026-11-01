// The import preview through the real door: a dry-run tree upload runs as the import-st workload, reports what a
// real run would bring and skip, writes no row anywhere, and leaves the same files importable.
// @subject packages/server/src/entry/http/import-tree.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import { readdir } from "node:fs/promises";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { ImportPreview } from "@orb/contracts/import";
import {
  IMPORT_PREVIEW_LIST_MAX,
  IMPORT_PREVIEW_TEXT_MAX,
  importStartedSchema,
  mergeImportPreviews,
  ST_SECRETS_FILE,
  ST_SETTINGS_FILE,
  TREE_DRY_RUN_FIELD,
  TREE_DRY_RUN_VALUE,
  TREE_FILE_FIELD,
} from "@orb/contracts/import";
import { PORTABILITY_ROUTES, PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";

const TREE_ROUTE = PORTABILITY_ROUTES.importTree;
const WRAPPER = "default-user";
const ENCODER = new TextEncoder();
// A dry run is still a job: its own row is the one write it owes.
const JOB_TABLES = new Set(["workloads"]);

type Bytes = Uint8Array | string;
type Files = Readonly<Record<string, Bytes>>;

function harness(): Promise<ServerTestHarness> {
  return createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
}

// SillyTavern wire text is snake_case by spec, so the fixtures are raw JSON text.
function cardJson(name: string): string {
  return `{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":${JSON.stringify(name)},"description":"${name.slice(0, 40)} keeps the light.","first_mes":"The lamp is lit."}}`;
}

function cardPng(root: ServerTestHarness, name: string): Uint8Array {
  return writeCardChunk(new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))), cardJson(name));
}

function settings(personas: Readonly<Record<string, string>>): string {
  return JSON.stringify({ ["power_user"]: { personas } });
}

const CHAT = [
  '{"user_name":"Bob","character_name":"Aria","create_date":"2025-07-18@12h00m00s"}',
  '{"is_user":false,"mes":"Aria greets you.","send_date":"2025-07-18@12h00m01s"}',
].join("\n");
const WORLD = '{"entries":{"0":{"uid":0,"key":["eldoria"],"comment":"Eldoria","content":"A forest.","order":100}}}';

function profile(root: ServerTestHarness): Files {
  return {
    [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "characters/broken.png": "not a card",
    "chats/Aria/one.jsonl": CHAT,
    "worlds/Eldoria.json": WORLD,
    "movingUI/layout.json": "{}",
  };
}

async function post(root: ServerTestHarness, files: Files, dryRunFields: readonly (string | File)[]): Promise<Response> {
  const form = new FormData();
  for (const [path, bytes] of Object.entries(files)) {
    const relPath = `${WRAPPER}/${path}`;
    form.append(TREE_FILE_FIELD, new File([typeof bytes === "string" ? ENCODER.encode(bytes) : new Uint8Array(bytes)], relPath), relPath);
  }
  for (const value of dryRunFields) {
    form.append(TREE_DRY_RUN_FIELD, value);
  }
  return await root.http.request(TREE_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: form });
}

async function run(root: ServerTestHarness, files: Files, dryRunFields: readonly string[]): Promise<ImportPreview | undefined> {
  const response = await post(root, files, dryRunFields);
  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await root.runAdmittedWorkload(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id: workloadId });
  expect(row).toMatchObject({ kind: "import-st", status: "succeeded" });
  if (row.kind !== "import-st" || row.poison || row.result === null) {
    throw new Error("the import has no canonical result");
  }
  return row.result.preview;
}

async function dryRun(root: ServerTestHarness, files: Files): Promise<ImportPreview> {
  const preview = await run(root, files, [TREE_DRY_RUN_VALUE]);
  if (preview === undefined) {
    throw new Error("a dry run reported no preview");
  }
  return preview;
}

/** How many rows every table holds, the job tables aside. */
async function rowCounts(root: ServerTestHarness): Promise<Record<string, number>> {
  const tables = await root.db.all<{ name: string }>(sql`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    if (!JOB_TABLES.has(name)) {
      const rows = await root.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.identifier(name)}`);
      counts[name] = rows[0]?.n ?? 0;
    }
  }
  return counts;
}

function names(preview: ImportPreview, kind: keyof ImportPreview["kinds"]): readonly string[] {
  return preview.kinds[kind].items.map((item) => item.name);
}

test("a dry run names what each kind would bring and what it would skip, writes no row in any table, and a real run then lands it", async () => {
  await using root = await harness();
  const files = profile(root);
  // The first HTTP request seeds the owner's default content in the background, so the baseline follows it.
  await (await post(root, files, ["refused"])).arrayBuffer();
  await root.settleBackground();
  const before = await rowCounts(root);

  const preview = await dryRun(root, files);

  expect(names(preview, "characters")).toEqual(["Aria"]);
  expect(preview.kinds.characters.items[0]?.inLibrary).toBeUndefined();
  expect(preview.kinds.chats.total).toBe(1);
  expect(names(preview, "personas")).toEqual(["Bob"]);
  expect(names(preview, "worlds")).toEqual(["Eldoria"]);
  expect(preview.skipped.items.map((item) => item.source)).toEqual(expect.arrayContaining(["broken.png", "movingUI/"]));
  expect(preview.skipped.items.every((item) => item.reason.length > 0)).toBe(true);
  expect(await rowCounts(root)).toEqual(before);
  expect(await readdir(root.importStagingDir, { recursive: true })).not.toContainEqual(expect.stringContaining("characters"));

  // The control: the count check moves as soon as the same bytes really import.
  await run(root, files, []);
  const after = await rowCounts(root);
  expect(after["characters"]).toBe((before["characters"] ?? 0) + 1);
  expect(after["personas"]).toBe((before["personas"] ?? 0) + 1);
  expect(after["world_books"]).toBe((before["world_books"] ?? 0) + 1);

  const again = await dryRun(root, files);
  expect(again.kinds.characters.items[0]).toMatchObject({ name: "Aria", inLibrary: true });
});

test("a hostile folder's names are clipped, its lists capped with an exact total, and no server path or credential reaches the preview", async () => {
  await using root = await harness();
  const over = IMPORT_PREVIEW_LIST_MAX + 1;
  const personas = Object.fromEntries(Array.from({ length: over }, (_, i) => [`p${String(i)}.png`, `Persona ${String(i)}`]));
  const long = "N".repeat(IMPORT_PREVIEW_TEXT_MAX * 2);

  const preview = await dryRun(root, {
    [ST_SETTINGS_FILE]: settings(personas),
    "characters/long.png": cardPng(root, long),
    [ST_SECRETS_FILE]: '{"api_key_openai":"planted-credential"}',
  });

  expect(preview.kinds.personas.total).toBe(over);
  expect(preview.kinds.personas.items).toHaveLength(IMPORT_PREVIEW_LIST_MAX);
  expect(preview.kinds.characters.items[0]?.name).toHaveLength(IMPORT_PREVIEW_TEXT_MAX);
  const wire = JSON.stringify(preview);
  expect(wire).not.toContain(root.importStagingDir);
  expect(wire).not.toContain("planted-credential");
});

test("a split folder's previews count a repeated card and the shared settings once", async () => {
  await using root = await harness();
  const shared = { [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }), "worlds/Eldoria.json": WORLD };
  const aria = cardPng(root, "Aria");
  const first = await dryRun(root, { ...shared, "characters/Aria.png": aria, "chats/Aria/one.jsonl": CHAT });
  const second = await dryRun(root, { ...shared, "characters/Aria.png": aria, "characters/Bram.png": cardPng(root, "Bram") });

  const merged = mergeImportPreviews([first, second]);

  expect(names(merged, "characters")).toEqual(["Aria", "Bram"]);
  expect(merged.kinds.characters.total).toBe(2);
  expect(merged.kinds.personas.total).toBe(1);
  expect(merged.kinds.worlds.total).toBe(1);
  expect(merged.kinds.chats.total).toBe(1);
});

test("a dry-run field that is malformed, repeated, or on a native backup refuses with nothing staged and no job", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const native = { [`${PORTABLE_DIRECTORIES.regex}tidy.json`]: "{}" };
  const refused: readonly (readonly [Files, readonly (string | File)[]])[] = [
    [profile(root), ["yes"]],
    [profile(root), [TREE_DRY_RUN_VALUE, TREE_DRY_RUN_VALUE]],
    [profile(root), [new File([TREE_DRY_RUN_VALUE], "dryRun")]],
    [native, [TREE_DRY_RUN_VALUE]],
  ];
  for (const [files, fields] of refused) {
    const response = await post(root, files, fields);
    await response.arrayBuffer();
    expect(response.status).toBe(400);
  }
  expect(await readdir(root.importStagingDir, { recursive: true })).toEqual(expect.not.arrayContaining([expect.stringContaining("import-tree-")]));
  expect(await root.services.workloads.list({ caller: principal, kind: "import-st" })).toEqual([]);
  expect(await root.services.workloads.list({ caller: principal, kind: "import-bundle" })).toEqual([]);
});
