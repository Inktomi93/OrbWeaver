// Import identity through the REAL doors (D290). Each case runs the composed stack against a real
// database: the Characters dialog door (`runProfileImport`) and the profile-folder door (the `import-st`
// contribution over a staged SillyTavern profile). The split-upload case also runs the browser planner
// (`planTreeImport`), because the batches it sends are what the server sees. Pins: a split folder upload
// mints each persona once, with its avatar; a JSON card stays findable after its PNG gives it art; the
// embedded-book door numbers a taken book name; and a world name-link binds the book the worlds wave landed.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import type { ServicesResult } from "@orb/server/entry/compose";
import { runProfileImport } from "@orb/server/entry/import";
import { describe } from "vitest";
import { relativePathOf } from "../../../../packages/client/src/data/import-tree.ts";
// Deep import of the PURE planner module (the barrel drags browser TSX into the node program).
import { planTreeImport } from "../../../../packages/client/src/data/import-tree-plan.ts";
import "../../../support/composed-real.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, OWNER_USER_ID, test } from "../../../support/fixtures.ts";

const ENC = new TextEncoder();

/** A minimal valid PNG (signature + zero-length IEND) the kit codec embeds a card into. */
const MINIMAL_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** The same PNG with one zero-length private ancillary chunk (`abCd`) ahead of IEND, so its art (the PNG
 *  minus its card chunks) differs from {@link MINIMAL_PNG}'s. */
const OTHER_ART_PNG = Uint8Array.from([
  ...MINIMAL_PNG.slice(0, 8),
  0x00,
  0x00,
  0x00,
  0x00,
  0x61,
  0x62,
  0x43,
  0x64,
  0x78,
  0x06,
  0xe9,
  0xb3,
  ...MINIMAL_PNG.slice(8),
]);

// SillyTavern wire text is snake_case by spec, so the fixtures are raw JSON text.

function v2Card(name: string, extra: { readonly book?: string; readonly world?: string } = {}): string {
  const book = extra.book === undefined ? "" : `,"character_book":${extra.book}`;
  const world = extra.world === undefined ? "" : `,"extensions":{"world":${JSON.stringify(extra.world)}}`;
  return `{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":${JSON.stringify(name)},"description":"${name} keeps the harbor light.","first_mes":"The lamp is lit."${book}${world}}}`;
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

/** A directory-picked browser File (its read-only `webkitRelativePath` set, as the picker sets it). */
function pickedFile(relPath: string, bytes: Uint8Array | string): File {
  const file = new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], relPath.split("/").at(-1) ?? relPath);
  Object.defineProperty(file, "webkitRelativePath", { value: relPath, configurable: true });
  return file;
}

interface StagedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Stage one upload's files as the tree route does (the picked folder's wrapper stripped) and run the real
 *  `import-st` contribution over it. */
async function importStaged(
  ctx: { readonly app: ServicesResult; readonly importStagingDir: string; readonly now: () => number },
  token: string,
  files: readonly StagedFile[],
): Promise<void> {
  const root = join(ctx.importStagingDir, OWNER_USER_ID, token);
  for (const file of files) {
    const target = join(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }
  const result = await ctx.app.workloadContributions["import-st"].run(
    { userId: OWNER_USER_ID, ownerId: OWNER_USER_ID, now: ctx.now },
    { stagedDir: token },
    () => undefined,
    new AbortController().signal,
  );
  expect(result.failed).toBe(0);
}

async function characterNamed(app: ServicesResult, name: string): Promise<CharacterId> {
  const found = await app.services.character.findByName({ ownerId: OWNER_USER_ID, name });
  const id = found[0]?.characterId;
  if (id === undefined) {
    throw new Error(`no character named ${name}`);
  }
  return id;
}

/** The Characters dialog door over one file. */
function dialogDoor(app: ServicesResult, userId: UserId, bytes: Uint8Array, filename: string): ReturnType<typeof runProfileImport> {
  return runProfileImport({
    principal: makePrincipal(userId),
    character: app.services.character,
    assets: app.assets,
    tag: app.services.tag,
    worldInfo: app.importWorldInfo,
    importCardScripts: app.importCardScripts,
    files: [{ bytes, filename }],
  });
}

describe("import identity across doors and split uploads", () => {
  test("a split folder upload mints each persona once, with its avatar, and every batch's transcripts attribute to it", async ({
    app,
    clock,
    ownerCaller,
    importStagingDir,
  }) => {
    const settings =
      '{"power_user":{"personas":{"bob.png":"Bob"},"persona_descriptions":{"bob.png":{"description":"A sailor.","position":0}},"default_persona":"bob.png"}}';
    const picked = [
      pickedFile(`data/default-user/${ST_SETTINGS_FILE}`, settings),
      pickedFile("data/default-user/User Avatars/bob.png", OTHER_ART_PNG),
      pickedFile("data/default-user/characters/Aria.png", writeCardChunk(MINIMAL_PNG, v2Card("Aria"))),
      pickedFile("data/default-user/chats/Aria/one.jsonl", chatJsonl("Bob", "Aria")),
      pickedFile("data/default-user/characters/Bram.png", writeCardChunk(MINIMAL_PNG, v2Card("Bram"))),
      pickedFile("data/default-user/chats/Bram/two.jsonl", chatJsonl("Bob", "Bram")),
    ];
    // Room for settings, the avatar and ONE character bundle per upload, so the two bundles split.
    const sizeOf = (i: number): number => picked[i]?.size ?? 0;
    const bundle = Math.max(sizeOf(2) + sizeOf(3), sizeOf(4) + sizeOf(5));
    const plan = await planTreeImport(picked, { totalBytes: sizeOf(0) + sizeOf(1) + bundle, fileBytes: 1_000_000, files: 50_000 }, (f) => f.text());
    expect(plan.batches.length, "the folder splits into more than one upload").toBeGreaterThan(1);

    let n = 0;
    for (const batch of plan.batches) {
      n += 1;
      const files = await Promise.all(
        batch.map(async (file) => ({ path: relativePathOf(file).replace(/^data\//u, ""), bytes: new Uint8Array(await file.arrayBuffer()) })),
      );
      await importStaged({ app, importStagingDir, now: () => clock.now() }, `split-${n}`, files);
    }

    const personas = await ownerCaller.persona.list();
    expect(personas.map((p) => ({ name: p.name, hasAvatar: (p.avatarAssetId ?? null) !== null }))).toEqual([{ name: "Bob", hasAvatar: true }]);
    const bob = personas[0]?.id;
    const rooms = await ownerCaller.chat.listChats({ limit: 50 });
    expect(rooms.items).toHaveLength(2);
    for (const room of rooms.items) {
      expect((await ownerCaller.chat.getChat({ chatId: room.id })).anchorPersonaId).toBe(bob);
    }
  });

  test("a JSON card, then its PNG, then the JSON again is one character; the same text under other art is a second", async ({ app, ownerCaller }) => {
    void ownerCaller; // seeds the owner account the door imports into
    const json = v2Card("Lantern Keeper");
    const door = (bytes: Uint8Array, filename: string): ReturnType<typeof runProfileImport> => dialogDoor(app, OWNER_USER_ID, bytes, filename);

    const first = await door(ENC.encode(json), "lantern-keeper.json");
    expect(first.failed).toEqual([]);
    expect(first.imported[0]?.created).toBe(true);
    const id = first.imported[0]?.characterId;

    expect((await door(writeCardChunk(MINIMAL_PNG, json), "lantern-keeper.png")).imported[0]).toMatchObject({ characterId: id, created: false });
    expect((await door(ENC.encode(json), "lantern-keeper.json")).imported[0]).toMatchObject({ characterId: id, created: false });
    expect((await door(writeCardChunk(MINIMAL_PNG, json), "lantern-keeper.png")).imported[0]).toMatchObject({ characterId: id, created: false });

    // Positive control: the kept art-less identity never swallows an alt-art version of the same text.
    const altArt = await door(writeCardChunk(OTHER_ART_PNG, json), "lantern-keeper-alt.png");
    expect(altArt.imported[0]?.created).toBe(true);
    expect(altArt.imported[0]?.characterId).not.toBe(id);
    expect(await app.services.character.findByName({ ownerId: OWNER_USER_ID, name: "Lantern Keeper" })).toHaveLength(2);
  });

  test("two different embedded books under one name land as the name and its numbered twin", async ({ app, ownerCaller }) => {
    const book = (content: string): string =>
      `{"name":"Shared Lore","entries":[{"keys":["lore"],"content":${JSON.stringify(content)},"comment":"Lore","insertion_order":1}]}`;

    await dialogDoor(app, OWNER_USER_ID, ENC.encode(v2Card("Aria", { book: book("The harbor floods at dusk.") })), "aria.json");
    await dialogDoor(app, OWNER_USER_ID, ENC.encode(v2Card("Bram", { book: book("The mountain never sleeps.") })), "bram.json");

    const books = await ownerCaller.worldInfo.listBooks();
    expect(books.map((b) => b.name).toSorted()).toEqual(["Shared Lore", "Shared Lore (2)"]);
    const linksOf = async (name: string): Promise<{ name: string; role: string | null }[]> =>
      (await ownerCaller.worldInfo.listForCharacter({ characterId: await characterNamed(app, name) })).map((b) => ({ name: b.name, role: b.role }));
    expect(await linksOf("Aria")).toEqual([{ name: "Shared Lore", role: "primary" }]);
    expect(await linksOf("Bram")).toEqual([{ name: "Shared Lore (2)", role: "primary" }]);
  });

  test("a card's world name-link binds the book this import landed, renamed or reused under another name", async ({
    app,
    clock,
    ownerCaller,
    importStagingDir,
  }) => {
    const ctx = { app, importStagingDir, now: (): number => clock.now() };
    const settings: StagedFile = { path: `profile/${ST_SETTINGS_FILE}`, bytes: ENC.encode("{}") };
    const eldoria = (content: string): StagedFile => ({ path: "profile/worlds/Eldoria.json", bytes: ENC.encode(stWorld(content)) });
    const card = (name: string): StagedFile => ({
      path: `profile/characters/${name}.png`,
      bytes: writeCardChunk(MINIMAL_PNG, v2Card(name, { world: "Eldoria" })),
    });
    const linksOf = async (name: string): Promise<{ id: string; role: string | null }[]> =>
      (await ownerCaller.worldInfo.listForCharacter({ characterId: await characterNamed(app, name) })).map((b) => ({ id: b.id, role: b.role }));

    // 1. The first import: Eldoria lands under its own name and Aria links it.
    await importStaged(ctx, "worlds-1", [settings, eldoria("A forest."), card("Aria")]);
    // 2. A re-import with changed lore: the new Eldoria lands beside the old one as "Eldoria (2)", and the card
    //    in THIS import links the book this import landed, not the stale one that holds the bare name.
    await importStaged(ctx, "worlds-2", [settings, eldoria("A burned forest."), card("Bram")]);

    const byName = new Map((await ownerCaller.worldInfo.listBooks()).map((b) => [b.name, b.id]));
    expect([...byName.keys()].toSorted()).toEqual(["Eldoria", "Eldoria (2)"]);
    expect(await linksOf("Aria")).toEqual([{ id: byName.get("Eldoria"), role: "primary" }]);
    expect(await linksOf("Bram")).toEqual([{ id: byName.get("Eldoria (2)"), role: "primary" }]);

    // 3. The owner renames the second book; a third import carries the same lore under the old file name. The
    //    worlds wave reuses the renamed row by content, and the card links it instead of reporting it missing.
    const renamed = byName.get("Eldoria (2)");
    if (renamed === undefined) {
      throw new Error("the second Eldoria did not land");
    }
    await ownerCaller.worldInfo.updateBook({ bookId: renamed, input: { name: "Ashlands" } });
    await importStaged(ctx, "worlds-3", [settings, eldoria("A burned forest."), card("Cato")]);
    expect((await ownerCaller.worldInfo.listBooks()).map((b) => b.name).toSorted()).toEqual(["Ashlands", "Eldoria"]);
    expect(await linksOf("Cato")).toEqual([{ id: renamed, role: "primary" }]);
  });

  // One upload holding two SillyTavern profiles imports into one owner, so its name-links are merged: a name
  // both profiles' worlds carry binds the book the first profile landed, the rule personas follow too.
  test("a two-profile upload binds a repeated world name to the first profile's book", async ({ app, clock, ownerCaller, importStagingDir }) => {
    const world = (profile: string, content: string): StagedFile => ({ path: `${profile}/worlds/Eldoria.json`, bytes: ENC.encode(stWorld(content)) });
    const card = (profile: string, name: string): StagedFile => ({
      path: `${profile}/characters/${name}.png`,
      bytes: writeCardChunk(MINIMAL_PNG, v2Card(name, { world: "Eldoria" })),
    });
    await importStaged({ app, importStagingDir, now: () => clock.now() }, "profiles", [
      { path: `alice/${ST_SETTINGS_FILE}`, bytes: ENC.encode("{}") },
      { path: `bob/${ST_SETTINGS_FILE}`, bytes: ENC.encode("{}") },
      world("alice", "A forest."),
      world("bob", "A desert."),
      card("alice", "Aria"),
      card("bob", "Bram"),
    ]);

    const byName = new Map((await ownerCaller.worldInfo.listBooks()).map((b) => [b.name, b.id]));
    expect([...byName.keys()].toSorted()).toEqual(["Eldoria", "Eldoria (2)"]);
    for (const name of ["Aria", "Bram"]) {
      const links = await ownerCaller.worldInfo.listForCharacter({ characterId: await characterNamed(app, name) });
      expect(links.map((b) => b.id)).toEqual([byName.get("Eldoria")]);
    }
  });
});
