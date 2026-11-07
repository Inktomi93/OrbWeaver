// A SillyTavern folder through the real tree door: what it posts, the workload it starts, and what it leaves on disk.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { ImportPreview } from "@orb/contracts/import";
import { importStartedSchema, TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE, TREE_FILE_FIELD } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";

const WRAPPER = "default-user";
const ENCODER = new TextEncoder();
// A dry run is still a job: its own row is the one write it owes.
const JOB_TABLES = new Set(["workloads"]);

type Bytes = Uint8Array | string;
export type Files = Readonly<Record<string, Bytes>>;

// The owner's default content seeds in the background after the first authed request. Settling it here keeps a
// test's before/after row deltas from racing the seed.
export async function harness(): Promise<ServerTestHarness> {
  const root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
  try {
    await (await post(root, {}, ["refused"])).arrayBuffer();
    await root.settleBackground();
  } catch (error) {
    await root[Symbol.asyncDispose]();
    throw error;
  }
  return root;
}

// SillyTavern wire text is snake_case by spec, so the fixtures are raw JSON text.
function cardJson(name: string): string {
  return `{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":${JSON.stringify(name)},"description":"${name.slice(0, 40)} keeps the light.","first_mes":"The lamp is lit."}}`;
}

export function cardPng(root: ServerTestHarness, name: string): Uint8Array {
  return writeCardChunk(new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))), cardJson(name));
}

export function settings(personas: Readonly<Record<string, string>>): string {
  return JSON.stringify({ ["power_user"]: { personas } });
}

export function chatOf(text: string): string {
  return [
    '{"user_name":"Bob","character_name":"Aria","create_date":"2025-07-18@12h00m00s"}',
    JSON.stringify({ ["is_user"]: false, mes: text, ["send_date"]: "2025-07-18@12h00m01s" }),
  ].join("\n");
}

export const CHAT = chatOf("Aria greets you.");
export const WORLD = '{"entries":{"0":{"uid":0,"key":["eldoria"],"comment":"Eldoria","content":"A forest.","order":100}}}';

export async function post(
  root: ServerTestHarness,
  files: Files,
  dryRunFields: readonly (string | File)[],
  headers: Readonly<Record<string, string>> = CSRF_HEADERS,
): Promise<Response> {
  const form = new FormData();
  for (const [path, bytes] of Object.entries(files)) {
    const relPath = `${WRAPPER}/${path}`;
    form.append(TREE_FILE_FIELD, new File([typeof bytes === "string" ? ENCODER.encode(bytes) : new Uint8Array(bytes)], relPath), relPath);
  }
  for (const value of dryRunFields) {
    form.append(TREE_DRY_RUN_FIELD, value);
  }
  return await root.http.request(PORTABILITY_ROUTES.importTree, { method: "POST", headers, body: form });
}

/** Post the folder and stop at the admitted row: nothing has read the staged tree yet. */
export async function admit(root: ServerTestHarness, files: Files, dryRunFields: readonly string[] = []): Promise<WorkloadId> {
  const response = await post(root, files, dryRunFields);
  expect(response.status).toBe(202);
  return importStartedSchema.parse(await response.json()).workloadId;
}

/** Run an admitted import to success and hand back its preview. */
export async function finish(root: ServerTestHarness, id: WorkloadId): Promise<ImportPreview | undefined> {
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await root.runAdmittedWorkload(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id });
  expect(row).toMatchObject({ kind: "import-st", status: "succeeded" });
  if (row.kind !== "import-st" || row.poison || row.result === null) {
    throw new Error("the import has no canonical result");
  }
  return row.result.preview;
}

export async function dryRun(root: ServerTestHarness, files: Files): Promise<ImportPreview> {
  const preview = await finish(root, await admit(root, files, [TREE_DRY_RUN_VALUE]));
  if (preview === undefined) {
    throw new Error("a dry run reported no preview");
  }
  return preview;
}

/** Every entry staged for one account, its uploads first. */
export async function stagedEntries(root: ServerTestHarness, ownerId: UserId = root.ownerId): Promise<readonly string[]> {
  const entries = await readdir(root.stagedImportsOf(ownerId), { recursive: true }).catch(() => []);
  return entries.toSorted((a, b) => a.localeCompare(b));
}

/** The one tree an account has staged. */
export async function stagedTree(root: ServerTestHarness, ownerId: UserId = root.ownerId): Promise<string> {
  const [token, ...others] = await readdir(root.stagedImportsOf(ownerId));
  if (token === undefined || others.length > 0) {
    throw new Error(`expected one staged upload, found ${String(others.length + (token === undefined ? 0 : 1))}`);
  }
  return join(root.stagedImportsOf(ownerId), token);
}

/** Every row of every table, the job tables aside, so a write of any kind shows as a difference. */
export async function tableContents(root: ServerTestHarness): Promise<Record<string, unknown[]>> {
  const tables = await root.db.all<{ name: string }>(sql`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  const contents: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    if (!JOB_TABLES.has(name)) {
      contents[name] = await root.db.all(sql`SELECT * FROM ${sql.identifier(name)} ORDER BY rowid`);
    }
  }
  return contents;
}

/** Every blob the content store holds. */
export async function storedBlobs(root: ServerTestHarness): Promise<readonly string[]> {
  const entries = await readdir(root.env.ASSETS_DIR, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted((a, b) => a.localeCompare(b));
}
