// Import identity through the real doors: the Characters dialog upload and the profile-folder tree upload.
// A JSON card and its PNG are one character, the same text under other art is a second, a repeated embedded book
// name gets a numbered twin, a world name-link binds the book its own import landed, and a folder split into
// uploads mints each persona once. A card's leftover vendor fields import as JSON text decodes them, however odd.
// @subject packages/server/src/entry/http/upload.ts
// @subject packages/server/src/entry/http/import-tree.ts
// @subject packages/server/src/entry/import/run-profile-import.ts

import { readFile } from "node:fs/promises";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { PersonaCollisionChoices } from "@orb/contracts/import";
import {
  cardImportResultSchema,
  encodePersonaCollisionChoices,
  importStartedSchema,
  PERSONA_COLLISION_FIELD,
  ST_SETTINGS_FILE,
  TREE_FILE_FIELD,
} from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { CharacterId, WorkloadId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

const DIALOG_ROUTE = PORTABILITY_ROUTES.importCards;
const TREE_ROUTE = PORTABILITY_ROUTES.importTree;
const DIALOG_FIELD = "file";
const WRAPPER = "default-user";
const ENCODER = new TextEncoder();
const OVERLONG_NAME_LENGTH = 100_000;

function harness(): Promise<ServerTestHarness> {
  return createServerHarness({
    // The first authed request starts the default-content seeder in the background; it would land its own books beside the import's.
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner", ["SEED_CONTENT"]: "off" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
}

/** A valid PNG. Every call is the same picture: the id only varies its card chunk, which is not art. */
function art(root: ServerTestHarness): Uint8Array {
  return new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
}

/** The same PNG with one zero-length private ancillary chunk (`abCd`) ahead of IEND: a different picture. */
const ABCD_CHUNK = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x61, 0x62, 0x43, 0x64, 0x78, 0x06, 0xe9, 0xb3]);
const IEND_CHUNK_BYTES = 12;
function otherArt(root: ServerTestHarness): Uint8Array {
  const png = art(root);
  return Uint8Array.from([...png.slice(0, -IEND_CHUNK_BYTES), ...ABCD_CHUNK, ...png.slice(-IEND_CHUNK_BYTES)]);
}

// SillyTavern wire text is snake_case by spec, so the fixtures are raw JSON text.
function card(name: string, extra: { readonly book?: string; readonly world?: string; readonly tags?: readonly string[] } = {}): string {
  const book = extra.book === undefined ? "" : `,"character_book":${extra.book}`;
  const world = extra.world === undefined ? "" : `,"extensions":{"world":${JSON.stringify(extra.world)}}`;
  const tags = extra.tags === undefined ? "" : `,"tags":${JSON.stringify(extra.tags)}`;
  return `{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":${JSON.stringify(name)},"description":"${name} keeps the harbor light.","first_mes":"The lamp is lit."${tags}${book}${world}}}`;
}

function stWorld(content: string): string {
  return `{"entries":{"0":{"uid":0,"key":["eldoria"],"comment":"Eldoria","content":${JSON.stringify(content)},"order":100}}}`;
}

function chatJsonl(userName: string, characterName: string): string {
  return [
    `{"user_name":${JSON.stringify(userName)},"character_name":${JSON.stringify(characterName)},"create_date":"2025-07-18@12h00m00s"}`,
    `{"is_user":false,"mes":"${characterName} greets you.","send_date":"2025-07-18@12h00m01s"}`,
    '{"is_user":true,"mes":"Hi!","send_date":"2025-07-18@12h00m02s"}',
  ].join("\n");
}

type Bytes = Uint8Array | string;

function bytesOf(value: Bytes): Uint8Array<ArrayBuffer> {
  return typeof value === "string" ? ENCODER.encode(value) : new Uint8Array(value);
}

/** The Characters dialog door over one file. */
async function dialog(root: ServerTestHarness, filename: string, bytes: Bytes): Promise<ReturnType<typeof cardImportResultSchema.parse>> {
  const form = new FormData();
  form.append(DIALOG_FIELD, new File([bytesOf(bytes)], filename));
  const response = await root.http.request(DIALOG_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: form });
  expect(response.status).toBe(200);
  return cardImportResultSchema.parse(await response.json());
}

/** One tree upload of a picked folder, run to the end of its import workload. */
async function uploadTree(
  root: ServerTestHarness,
  files: Readonly<Record<string, Bytes>>,
  choices: PersonaCollisionChoices = {},
  failed = 0,
): Promise<string | undefined> {
  const form = new FormData();
  for (const choice of encodePersonaCollisionChoices(choices)) {
    form.append(PERSONA_COLLISION_FIELD, choice);
  }
  for (const [path, bytes] of Object.entries(files)) {
    const relPath = `${WRAPPER}/${path}`;
    form.append(TREE_FILE_FIELD, new File([bytesOf(bytes)], relPath), relPath);
  }
  const response = await root.http.request(TREE_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: form });
  expect(response.status).toBe(202);
  const workloadId: WorkloadId = importStartedSchema.parse(await response.json()).workloadId;
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await run(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id: workloadId });
  expect(row).toMatchObject({ kind: "import-st", status: "succeeded" });
  const result = row.kind === "import-st" && !row.poison ? row.result : undefined;
  expect(result?.failed).toBe(failed);
  return result?.reportPath;
}

async function characterNamed(root: ServerTestHarness, name: string): Promise<CharacterId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const found = (await caller.character.list({})).items.filter((item) => item.name === name);
  const [first] = found;
  if (first === undefined || found.length !== 1) {
    throw new Error(`expected exactly one character named ${name}, found ${found.length}`);
  }
  return first.id;
}

async function charactersNamed(root: ServerTestHarness, name: string): Promise<number> {
  const caller = await root.internalCallerFor(root.ownerId);
  return (await caller.character.list({})).items.filter((item) => item.name === name).length;
}

test("a JSON card, then its PNG, then the JSON again is one character, and the same text under other art is a second", async () => {
  await using root = await harness();
  const json = card("Lantern Keeper");

  const first = await dialog(root, "lantern-keeper.json", json);
  expect(first.failed).toEqual([]);
  expect(first.imported[0]).toMatchObject({ created: true });
  const id = first.imported[0]?.characterId;

  const png = writeCardChunk(art(root), json);
  expect((await dialog(root, "lantern-keeper.png", png)).imported[0]).toMatchObject({ characterId: id, created: false });
  expect((await dialog(root, "lantern-keeper.json", json)).imported[0]).toMatchObject({ characterId: id, created: false });
  expect((await dialog(root, "lantern-keeper.png", png)).imported[0]).toMatchObject({ characterId: id, created: false });
  expect(await charactersNamed(root, "Lantern Keeper")).toBe(1);

  const alt = await dialog(root, "lantern-keeper-alt.png", writeCardChunk(otherArt(root), json));
  expect(alt.imported[0]).toMatchObject({ created: true });
  expect(present(alt.imported[0]).characterId).not.toBe(id);
  expect(await charactersNamed(root, "Lantern Keeper")).toBe(2);
});

test("a lore entry whose injection depth is past the cap imports with no depth directive, and one inside the cap keeps its depth", async () => {
  await using root = await harness();
  // ST position 4 is at-depth; the first depth is past any chat's length and past the injection cap.
  const book = `{"name":"Deep Lore","entries":[{"keys":["far"],"content":"Far lore.","comment":"Far","insertion_order":1,"extensions":{"position":4,"depth":100000000}},{"keys":["near"],"content":"Near lore.","comment":"Near","insertion_order":2,"extensions":{"position":4,"depth":3}}]}`;

  const result = await dialog(root, "deep.json", card("Deep Keeper", { book }));

  expect(result.failed).toEqual([]);
  const caller = await root.internalCallerFor(root.ownerId);
  const [stored] = await caller.worldInfo.listBooks();
  if (stored === undefined) {
    throw new Error("the card's embedded book did not import");
  }
  const entries = await caller.worldInfo.listEntries({ bookId: stored.id });
  expect(entries.map((entry) => [entry.content, entry.metadata?.inject?.depth]).toSorted()).toEqual([
    ["Far lore.", undefined],
    ["Near lore.", 3],
  ]);
});

test("a folder with a card the parser throws on and a card the schema refuses imports the good card and names both with their reasons", async () => {
  await using root = await harness();
  // An entry key that collides with a typed metadata field makes the card parse itself throw.
  const thrown = card("Thrown", { book: '{"name":"Bad Lore","entries":[{"keys":["x"],"content":"Lore.","scopeMode":"bogus"}]}' });
  // A description past the card schema's cap parses and is refused when the character is written.
  const refused = card("N".repeat(OVERLONG_NAME_LENGTH));

  const reportPath = await uploadTree(
    root,
    {
      [ST_SETTINGS_FILE]: "{}",
      "characters/Aria.png": writeCardChunk(art(root), card("Aria")),
      "characters/thrown.png": writeCardChunk(art(root), thrown),
      "characters/refused.png": writeCardChunk(art(root), refused),
    },
    {},
    2,
  );

  expect(await charactersNamed(root, "Aria")).toBe(1);
  if (reportPath === undefined) {
    throw new Error("the import wrote no report");
  }
  const skipped = (await readFile(reportPath, "utf8"))
    .split("\n")
    .filter((line) => line.includes(".png`"))
    .toSorted();
  expect(skipped).toEqual([
    expect.stringMatching(/^- `refused\.png` — card_invalid: .*Too big.*description/u),
    expect.stringMatching(/^- `thrown\.png` — .*scopeMode/u),
  ]);
});

test("two different embedded books under one name land as the name and its numbered twin, each linked to its own card", async () => {
  await using root = await harness();
  const book = (content: string): string =>
    `{"name":"Shared Lore","entries":[{"keys":["lore"],"content":${JSON.stringify(content)},"comment":"Lore","insertion_order":1}]}`;

  await dialog(root, "aria.json", card("Aria", { book: book("The harbor floods at dusk.") }));
  await dialog(root, "bram.json", card("Bram", { book: book("The mountain never sleeps.") }));

  const caller = await root.internalCallerFor(root.ownerId);
  expect((await caller.worldInfo.listBooks()).map((b) => b.name).toSorted()).toEqual(["Shared Lore", "Shared Lore (2)"]);
  const linksOf = async (name: string): Promise<{ name: string; role: string | null }[]> =>
    (await caller.worldInfo.listForCharacter({ characterId: await characterNamed(root, name) })).map((b) => ({ name: b.name, role: b.role }));
  expect(await linksOf("Aria")).toEqual([{ name: "Shared Lore", role: "primary" }]);
  expect(await linksOf("Bram")).toEqual([{ name: "Shared Lore (2)", role: "primary" }]);
});

test("card tags apply at once through both doors, and a model's pending suggestion survives a re-import", async () => {
  await using root = await harness();
  const tagged = card("Tagged Keeper", { tags: ["harbor", "keeper"] });
  const caller = await root.internalCallerFor(root.ownerId);

  const imported = await dialog(root, "tagged-keeper.json", tagged);
  expect(imported.failed).toEqual([]);
  const characterId = await characterNamed(root, "Tagged Keeper");
  const applied = async (): Promise<string[]> => (await caller.character.get({ characterId })).tags.map((tag) => tag.name).toSorted();
  expect(await applied()).toEqual(["harbor", "keeper"]);
  expect(await caller.tag.listPendingSuggestions({ characterId })).toEqual([]);

  await root.services.tag.attachCardTagByName({ ownerId: root.ownerId, characterId, tagName: "model suggestion", source: "auto", status: "pending" });
  await uploadTree(root, { [ST_SETTINGS_FILE]: "{}", "characters/tagged-keeper.json": tagged });

  expect(await charactersNamed(root, "Tagged Keeper")).toBe(1);
  expect(await applied()).toEqual(["harbor", "keeper"]);
  expect((await caller.tag.listPendingSuggestions({ characterId })).map((tag) => ({ name: tag.name, source: tag.source }))).toEqual([
    { name: "model suggestion", source: "auto" },
  ]);
});

test("a folder split into uploads mints each persona once, with its avatar, and every upload's transcripts attribute to it", async () => {
  await using root = await harness();
  const settings =
    '{"power_user":{"personas":{"bob.png":"Bob"},"persona_descriptions":{"bob.png":{"description":"A sailor.","position":0}},"default_persona":"bob.png"}}';
  const avatar = art(root);
  const withPersona = { [ST_SETTINGS_FILE]: settings, "User Avatars/bob.png": avatar };

  await uploadTree(root, {
    ...withPersona,
    "characters/Aria.png": writeCardChunk(art(root), card("Aria")),
    "chats/Aria/one.jsonl": chatJsonl("Bob", "Aria"),
  });
  await uploadTree(root, {
    ...withPersona,
    "characters/Bram.png": writeCardChunk(art(root), card("Bram")),
    "chats/Bram/two.jsonl": chatJsonl("Bob", "Bram"),
  });

  const caller = await root.internalCallerFor(root.ownerId);
  const personas = await caller.persona.list();
  expect(personas.map((p) => ({ name: p.name, hasAvatar: (p.avatarAssetId ?? null) !== null }))).toEqual([{ name: "Bob", hasAvatar: true }]);
  const rooms = await caller.chat.listChats({ limit: 50 });
  expect(rooms.items).toHaveLength(2);
  for (const room of rooms.items) {
    expect((await caller.chat.getChat({ chatId: room.id })).anchorPersonaId).toBe(personas[0]?.id);
  }
});

test("keep-both lands a numbered persona only for different content: an equal persona is reused, never copied", async () => {
  await using root = await harness();
  const settingsOf = (description: string): string =>
    `{"power_user":{"personas":{"bob.png":"Bob"},"persona_descriptions":{"bob.png":{"description":${JSON.stringify(description)},"position":0}},"default_persona":"bob.png"}}`;
  const avatar = art(root);
  const keepBoth = { bob: "keep-both" } as const;
  const caller = await root.internalCallerFor(root.ownerId);
  const names = async (): Promise<string[]> => (await caller.persona.list()).map((persona) => persona.name).toSorted();

  await uploadTree(root, { [ST_SETTINGS_FILE]: settingsOf("A sailor."), "User Avatars/bob.png": avatar }, keepBoth);
  await uploadTree(root, { [ST_SETTINGS_FILE]: settingsOf("A sailor."), "User Avatars/bob.png": avatar }, keepBoth);
  expect(await names()).toEqual(["Bob"]);

  await uploadTree(root, { [ST_SETTINGS_FILE]: settingsOf("A captain."), "User Avatars/bob.png": avatar }, keepBoth);
  expect(await names()).toEqual(["Bob", "Bob 2"]);
});

test("a two-profile upload binds a repeated world name to the first profile's book", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const world = (profile: string, content: string): Record<string, Bytes> => ({ [`${profile}/worlds/Eldoria.json`]: stWorld(content) });
  const linked = (profile: string, name: string): Record<string, Bytes> => ({
    [`${profile}/characters/${name}.png`]: writeCardChunk(art(root), card(name, { world: "Eldoria" })),
  });

  await uploadTree(root, {
    [`alice/${ST_SETTINGS_FILE}`]: "{}",
    [`bob/${ST_SETTINGS_FILE}`]: "{}",
    ...world("alice", "A forest."),
    ...world("bob", "A desert."),
    ...linked("alice", "Aria"),
    ...linked("bob", "Bram"),
  });

  const byName = new Map((await caller.worldInfo.listBooks()).map((b) => [b.name, b.id]));
  expect([...byName.keys()].toSorted()).toEqual(["Eldoria", "Eldoria (2)"]);
  for (const name of ["Aria", "Bram"]) {
    const links = await caller.worldInfo.listForCharacter({ characterId: await characterNamed(root, name) });
    expect(links.map((b) => b.id)).toEqual([byName.get("Eldoria")]);
  }
});

test("a card's world name-link binds the book its own import landed, whatever name the book carries", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const eldoria = (content: string): Record<string, Bytes> => ({ "worlds/Eldoria.json": stWorld(content) });
  const linked = (name: string): Record<string, Bytes> => ({ [`characters/${name}.png`]: writeCardChunk(art(root), card(name, { world: "Eldoria" })) });
  const linksOf = async (name: string): Promise<{ id: string; role: string | null }[]> =>
    (await caller.worldInfo.listForCharacter({ characterId: await characterNamed(root, name) })).map((b) => ({ id: b.id, role: b.role }));

  await uploadTree(root, { [ST_SETTINGS_FILE]: "{}", ...eldoria("A forest."), ...linked("Aria") });
  // Changed lore lands beside the old book as "Eldoria (2)", and this import's card links it, not the stale bare name.
  await uploadTree(root, { [ST_SETTINGS_FILE]: "{}", ...eldoria("A burned forest."), ...linked("Bram") });

  const byName = new Map((await caller.worldInfo.listBooks()).map((b) => [b.name, b.id]));
  expect([...byName.keys()].toSorted()).toEqual(["Eldoria", "Eldoria (2)"]);
  expect(await linksOf("Aria")).toEqual([{ id: byName.get("Eldoria"), role: "primary" }]);
  expect(await linksOf("Bram")).toEqual([{ id: byName.get("Eldoria (2)"), role: "primary" }]);

  // The owner renames the second book; the same lore under the old file name reuses the renamed row by content.
  const renamed = byName.get("Eldoria (2)");
  if (renamed === undefined) {
    throw new Error("the second Eldoria did not land");
  }
  await caller.worldInfo.updateBook({ bookId: renamed, input: { name: "Ashlands" } });
  await uploadTree(root, { [ST_SETTINGS_FILE]: "{}", ...eldoria("A burned forest."), ...linked("Cato") });

  expect((await caller.worldInfo.listBooks()).map((b) => b.name).toSorted()).toEqual(["Ashlands", "Eldoria"]);
  expect(await linksOf("Cato")).toEqual([{ id: renamed, role: "primary" }]);
});

// JSON text decodes an overflowing number literal to `Infinity` (stored as null) and nests as deep as its author
// wrote; neither is a reason to refuse the card that carries it.
const RESIDUE_DEPTH = 2500;
function residueCard(name: string, vendorJson: string): string {
  return `{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":${JSON.stringify(name)},"description":"${name} keeps odd notes.","first_mes":"Hello.","extensions":{"vendor":${vendorJson}}}}`;
}
const OVERFLOW = residueCard("Overflow Keeper", "1e400");
const DEEP = residueCard("Deep Keeper", `${"[".repeat(RESIDUE_DEPTH)}1${"]".repeat(RESIDUE_DEPTH)}`);

test("a card whose leftover fields overflow a number or nest deep imports through the Characters dialog", async () => {
  await using root = await harness();

  for (const [file, text] of [
    ["overflow.json", OVERFLOW],
    ["deep.json", DEEP],
  ] as const) {
    const result = await dialog(root, file, text);
    expect(result.failed, file).toEqual([]);
    expect(result.imported[0], file).toMatchObject({ created: true });
  }
  expect(await charactersNamed(root, "Overflow Keeper")).toBe(1);
  expect(await charactersNamed(root, "Deep Keeper")).toBe(1);
});

test("a profile folder imports an overflowing and a deep card beside a good one", async () => {
  await using root = await harness();

  await uploadTree(root, {
    [ST_SETTINGS_FILE]: "{}",
    "characters/Good.png": writeCardChunk(art(root), card("Good Keeper")),
    "characters/Overflow.png": writeCardChunk(art(root), OVERFLOW),
    "characters/Deep.png": writeCardChunk(art(root), DEEP),
  });

  for (const name of ["Good Keeper", "Overflow Keeper", "Deep Keeper"]) {
    expect(await charactersNamed(root, name), name).toBe(1);
  }
});
