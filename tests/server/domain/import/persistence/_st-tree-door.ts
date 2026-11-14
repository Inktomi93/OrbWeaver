// A SillyTavern folder through the real tree door: what it posts, the workload it starts, and what it leaves on disk.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { ImportPreview, ImportPreviewKind, PersonaCollisionChoices } from "@orb/contracts/import";
import {
  cardImportResultSchema,
  encodePersonaCollisionChoices,
  importStartedSchema,
  PERSONA_COLLISION_FIELD,
  ST_SETTINGS_FILE,
  TREE_DRY_RUN_FIELD,
  TREE_DRY_RUN_VALUE,
  TREE_FILE_FIELD,
} from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import type { MaintenanceResult } from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect } from "@orb/testkit/node";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
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
export async function harness(
  options: Pick<ServerHarnessOptions, "db" | "startJobs" | "providerFetch" | "ownerId" | "clock" | "ids"> = {},
): Promise<ServerTestHarness> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
      physicalPeer: () => "127.0.0.1",
      startJobs: false,
      ...options,
    }),
  );
  await (await post(root, {}, ["refused"])).arrayBuffer();
  await root.settleBackground();
  construction.move();
  return root;
}

// SillyTavern wire text is snake_case by spec, so the fixtures are raw JSON text.
export function cardJson(name: string): string {
  return `{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":${JSON.stringify(name)},"description":"${name.slice(0, 40)} keeps the light.","first_mes":"The lamp is lit."}}`;
}

/** A card PNG. Every call is the same picture: the id varies only the bytes the card chunk replaces, which are not art. */
export function cardPng(root: ServerTestHarness, name: string): Uint8Array {
  return writeCardChunk(new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))), cardJson(name));
}

// One zero-length private ancillary chunk (`abCd`) ahead of IEND makes a different picture of the same pixels.
const ABCD_CHUNK = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x61, 0x62, 0x43, 0x64, 0x78, 0x06, 0xe9, 0xb3]);
const IEND_CHUNK_BYTES = 12;

/** The card {@link cardPng} writes, under other art. */
export function cardPngUnderOtherArt(root: ServerTestHarness, name: string): Uint8Array {
  const png = new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  return writeCardChunk(Uint8Array.from([...png.slice(0, -IEND_CHUNK_BYTES), ...ABCD_CHUNK, ...png.slice(-IEND_CHUNK_BYTES)]), cardJson(name));
}

/** One card file through the Characters dialog door. */
export async function importThroughDialog(root: ServerTestHarness, filename: string, bytes: Bytes): Promise<void> {
  const form = new FormData();
  form.append(UPLOAD_FILE_FIELD, new File([typeof bytes === "string" ? ENCODER.encode(bytes) : new Uint8Array(bytes)], filename));
  const response = await root.http.request(PORTABILITY_ROUTES.importCards, { method: "POST", headers: CSRF_HEADERS, body: form });
  expect(response.status).toBe(200);
  expect(cardImportResultSchema.parse(await response.json()).failed).toEqual([]);
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

interface PostOptions {
  readonly headers?: Readonly<Record<string, string>>;
  /** The owner's answers to the persona collision review. */
  readonly choices?: PersonaCollisionChoices;
}

export async function post(
  root: ServerTestHarness,
  files: Files,
  dryRunFields: readonly (string | File)[],
  { headers = CSRF_HEADERS, choices = {} }: PostOptions = {},
): Promise<Response> {
  const form = new FormData();
  for (const choice of encodePersonaCollisionChoices(choices)) {
    form.append(PERSONA_COLLISION_FIELD, choice);
  }
  for (const [path, bytes] of Object.entries(files)) {
    const relPath = path.startsWith("/") ? path.slice(1) : `${WRAPPER}/${path}`;
    form.append(TREE_FILE_FIELD, new File([typeof bytes === "string" ? ENCODER.encode(bytes) : new Uint8Array(bytes)], relPath), relPath);
  }
  for (const value of dryRunFields) {
    form.append(TREE_DRY_RUN_FIELD, value);
  }
  return await root.http.request(PORTABILITY_ROUTES.importTree, { method: "POST", headers, body: form });
}

/** Post the folder and stop at the admitted row: nothing has read the staged tree yet. `choices` are the owner's
 *  answers to the persona collision review, which the dry run and the run both honor. */
export async function admit(
  root: ServerTestHarness,
  files: Files,
  dryRunFields: readonly string[] = [],
  choices: PersonaCollisionChoices = {},
): Promise<WorkloadId> {
  const response = await post(root, files, dryRunFields, { choices });
  expect(response.status).toBe(202);
  return importStartedSchema.parse(await response.json()).workloadId;
}

/** Run an admitted import to success and hand back its result. */
export async function finishRun(root: ServerTestHarness, id: WorkloadId): Promise<MaintenanceResult> {
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await root.runAdmittedWorkload(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id });
  expect(row).toMatchObject({ kind: "import-st", status: "succeeded" });
  if (row.kind !== "import-st" || row.poison || row.result === null) {
    throw new Error("the import has no canonical result");
  }
  return row.result;
}

/** Run an admitted import to success and hand back its preview. */
export async function finish(root: ServerTestHarness, id: WorkloadId): Promise<ImportPreview | undefined> {
  return (await finishRun(root, id)).preview;
}

export async function dryRun(root: ServerTestHarness, files: Files, choices: PersonaCollisionChoices = {}): Promise<ImportPreview> {
  const preview = await finish(root, await admit(root, files, [TREE_DRY_RUN_VALUE], choices));
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

const KIND_GROUP = (name: string, member: string, leaf: string): string => JSON.stringify({ name, members: [member], chats: [leaf] });
// A saved ST chat-completion preset; the text makes two presets differ in content.
export const presetOf = (text: string): string =>
  JSON.stringify({
    prompts: [{ identifier: "main", name: "Main", content: text, role: "system" }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
  });
export const themeOf = (name: string, surface: string): string => JSON.stringify({ name, ["blur_tint_color"]: surface });

/** What a folder holds of each kind, named as the preview names it. */
export type KindNames = Readonly<Record<ImportPreviewKind, readonly string[]>>;

/** One folder with an item of every import kind. `held` and `fresh` never share an identity, so a library that
 *  imported `held` owns every item of it and none of `fresh`. */
function kindFolder(root: ServerTestHarness, which: "held" | "fresh"): { readonly files: Files; readonly names: KindNames } {
  const held = which === "held";
  const [card, persona, personaFile, book, preset, theme, surface, group, groupLeaf, orphan, backdrop, text] = held
    ? ["Aria", "Bob", "bob.png", "Eldoria", "Held", "Dusk", "rgba(23, 23, 40, 1)", "Held Group", "held-room", "Wanderer", "Dawn", "held"]
    : ["Bram", "Cat", "cat.png", "Mirefen", "Fresh", "Ember", "rgba(60, 20, 20, 1)", "Fresh Group", "fresh-room", "Drifter", "Dusk", "fresh"];
  const cardFile = `${card}.png`;
  const files: Files = {
    [ST_SETTINGS_FILE]: settings({ [personaFile]: persona }),
    [`characters/${cardFile}`]: cardPng(root, card),
    [`chats/${card}/solo.jsonl`]: chatOf(`${text} solo`),
    [`worlds/${book}.json`]: JSON.stringify({ entries: { "0": { uid: 0, key: [book.toLowerCase()], comment: book, content: `${text} lore.`, order: 100 } } }),
    [`OpenAI Settings/${preset}.json`]: presetOf(`You are ${text}.`),
    [`themes/${theme}.json`]: themeOf(theme, surface),
    [`backgrounds/${backdrop}.png`]: new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
    [`groups/${text}.json`]: KIND_GROUP(group, cardFile, groupLeaf),
    [`group chats/${groupLeaf}.jsonl`]: chatOf(`${text} room`),
    [`chats/${orphan}/orphan.jsonl`]: chatOf(`${text} orphan`),
  };
  return {
    files,
    names: {
      characters: [card],
      chats: [`${card}: solo`, `${group}: ${groupLeaf}`, `${orphan}: orphan`],
      personas: [persona],
      worlds: [book],
      presets: [`${preset} (OpenAI)`],
      themes: [`${theme} (SillyTavern)`],
      backgrounds: [backdrop],
      groups: [group],
      orphans: [orphan],
    },
  };
}

/** The `held` and `fresh` folders as one upload: both settings files name their persona, so the merge keeps both. */
export function bothKindFolders(root: ServerTestHarness): {
  readonly held: Files;
  readonly fresh: Files;
  readonly both: Files;
  readonly names: Readonly<Record<"held" | "fresh", KindNames>>;
} {
  const held = kindFolder(root, "held");
  const fresh = kindFolder(root, "fresh");
  return {
    held: held.files,
    fresh: fresh.files,
    both: { ...held.files, ...fresh.files, [ST_SETTINGS_FILE]: settings({ ["bob.png"]: "Bob", ["cat.png"]: "Cat" }) },
    names: { held: held.names, fresh: fresh.names },
  };
}

/** Lay a folder's files under their own profile directory, beside any other profile of the same upload. */
export function inProfile(profile: string, files: Files): Files {
  return Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`/${profile}/${path}`, bytes]));
}

/** Items that take the `held` folder's names with other content: a persona with a description, a world book with
 *  other lore, a preset with other text, a theme with another surface and a background with other bytes. */
export function namesakeFolder(root: ServerTestHarness): Files {
  return {
    [ST_SETTINGS_FILE]: JSON.stringify({
      ["power_user"]: { personas: { "bob.png": "Bob" }, ["persona_descriptions"]: { "bob.png": { description: "Another Bob." } } },
    }),
    "worlds/Eldoria.json": JSON.stringify({ entries: { "0": { uid: 0, key: ["eldoria"], comment: "Eldoria", content: "A different forest.", order: 100 } } }),
    "OpenAI Settings/Held.json": presetOf("You are someone else."),
    "themes/Dusk.json": themeOf("Dusk", "rgba(90, 90, 20, 1)"),
    "backgrounds/Dawn.png": new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
  };
}
