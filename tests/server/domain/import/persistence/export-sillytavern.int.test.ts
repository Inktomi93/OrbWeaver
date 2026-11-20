// The library export door's SillyTavern format writes the owner's library as a SillyTavern user directory: each
// file in the shape the SillyTavern door the report names for it takes, every row it leaves behind named with its
// reason, and its dry run answers the very report the zip carries while writing nothing. The tree a run writes
// imports back here as the same library.
// @subject packages/server/src/domain/export/verbs/export-st-profile.ts
// @subject packages/server/src/entry/http/export.ts

import {
  ST_EXPORT_DOORS,
  ST_EXPORT_PROFILE_DIR,
  ST_EXPORT_REPORT_FILE,
  ST_SETTINGS_FILE,
  stExportReportSchema,
  stProfileExportPath,
} from "@orb/contracts/import";
import { tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import { ID_PREFIX } from "@orb/kit/ids";
import { readCardChunk } from "@orb/kit/png-card-chunk";
import { nonEmpty, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { strFromU8 } from "fflate";
import { z } from "zod";
import type { Files } from "./_st-tree-door.ts";
import { admit, attachmentOf, cardPng, chatOf, exportDryRun, exportedZip, finishRun, harness, presetOf, tableContents, WORLD } from "./_st-tree-door.ts";

const BAD_REQUEST = 400;
const NOTES = attachmentOf("notes.txt", "Field notes");

// SillyTavern's global regex list entry, as its Regex extension saves one.
const GLOBAL_SCRIPT = { id: "c0ffee00-0000-4000-8000-000000000002", scriptName: "Hush", findRegex: "/shouts/g", replaceString: "whispers", placement: [2] };

/** A SillyTavern profile with an item of each kind the export writes, a persona with no image, and a group room. */
function profile(root: ServerTestHarness): Files {
  const image = (): Uint8Array => new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  // SillyTavern's settings.json keys are snake_case by its own spelling.
  const settingsJson = JSON.stringify({
    ["power_user"]: { personas: { "bob.png": "Bob", "nobody.png": "Nobody" }, ["chat_display"]: 1, ["font_scale"]: 1.1 },
    tags: [{ id: "t1", name: "Hero" }],
    ["tag_map"]: { "Aria.png": ["t1"] },
    ["extension_settings"]: { attachments: [NOTES], ["character_attachments"]: { "Aria.png": [NOTES] }, regex: [GLOBAL_SCRIPT] },
  });
  return {
    [ST_SETTINGS_FILE]: settingsJson,
    "characters/Aria.png": cardPng(root, "Aria"),
    "characters/Lisa.png": cardPng(root, "Lisa"),
    "chats/Aria/first.jsonl": chatOf("Aria lights the lamp."),
    "groups/1700000000000.json": JSON.stringify({ name: "Duo", members: ["Aria.png", "Lisa.png"], chats: ["duo"], ["generation_mode"]: 1 }),
    "group chats/duo.jsonl": chatOf("Aria and Lisa share the lamp."),
    "worlds/Eldoria.json": WORLD,
    "OpenAI Settings/Plain.json": presetOf("You narrate."),
    "themes/Dusk.json": JSON.stringify({ name: "Dusk", ["blur_tint_color"]: "rgba(20, 20, 30, 1)", ["main_text_color"]: "rgba(230, 230, 230, 1)" }),
    "backgrounds/sky.png": image(),
    "User Avatars/bob.png": image(),
    "user/files/notes.txt": "The ford floods at dusk.",
    "user/images/Aria/glade.png": image(),
  };
}

/** The profile tree of a zip, keyed as the tree door takes a profile. */
function profileTree(zip: Readonly<Record<string, Uint8Array>>): Files {
  return Object.fromEntries(
    Object.entries(zip)
      .filter(([path]) => path.startsWith(ST_EXPORT_PROFILE_DIR))
      .map(([path, bytes]) => [path.slice(ST_EXPORT_PROFILE_DIR.length), bytes]),
  );
}

// SillyTavern's card read (`src/character-card-parser.js:54` `read`): the `ccv3` chunk, else `chara`, base64-decoded
// (the kit reader decodes the same way) to JSON;
// its PNG import then needs a `spec` and a `data.name` (`src/endpoints/characters.js:989` `importFromPng`).
const stPngCardSchema = z.object({ spec: z.string(), data: z.object({ name: z.string().min(1) }) });

async function stCardName(png: Uint8Array): Promise<string> {
  const chunk = (await readCardChunk(png, "ccv3")) ?? (await readCardChunk(png, "chara"));
  return stPngCardSchema.parse(JSON.parse(present(chunk))).data.name;
}

// SillyTavern's JSONL chat import reads the first line as the header and needs one of these keys
// (`src/endpoints/chats.js:848`).
function stChatHeaderAccepted(jsonl: string): boolean {
  const header: unknown = JSON.parse(present(jsonl.split("\n")[0]));
  return typeof header === "object" && header !== null && ("user_name" in header || "name" in header || "chat_metadata" in header);
}

// SillyTavern's theme import refuses a theme with no `name` (`public/scripts/power-user.js:2465` `importTheme`).
const stThemeSchema = z.object({ name: z.string().min(1) });

// SillyTavern's group list reads each `groups/*.json` as an object whose `chats` name files in `group chats/`
// (`src/endpoints/groups.js:135` `/all`), and seats `members` by card filename (`public/scripts/group-chats.js`).
const stGroupSchema = z.object({ id: z.string().min(1), members: z.array(z.string()).min(2), chats: z.array(z.string()).min(1) });

const stSettingsSchema = z.object({
  ["power_user"]: z.object({ personas: z.record(z.string(), z.string()) }),
  tags: z.array(z.object({ id: z.string(), name: z.string() })),
  ["tag_map"]: z.record(z.string(), z.array(z.string())),
});

// SillyTavern's world import refuses a file with no `entries` (`src/endpoints/worldinfo.js:113`).
function stWorldAccepted(text: string): boolean {
  const world: unknown = JSON.parse(text);
  return typeof world === "object" && world !== null && "entries" in world;
}

test("each exported file has the shape the SillyTavern door its report names takes", async () => {
  await using root = await harness();
  const files = profile(root);
  await finishRun(root, await admit(root, files));

  const zip = await exportedZip(root);
  const report = stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE]))));

  const pathsOf = (kind: keyof typeof ST_EXPORT_DOORS): string[] => report.files.filter((file) => file.kind === kind).map(({ path }) => path);
  expect(nonEmpty(report.files).every(({ kind, door }) => ST_EXPORT_DOORS[kind] === door)).toBe(true);
  expect(Object.keys(zip).toSorted((a, b) => a.localeCompare(b))).toEqual(
    [...report.files.map(({ path }) => path), ST_EXPORT_REPORT_FILE].toSorted((a, b) => a.localeCompare(b)),
  );
  const names = await Promise.all(
    pathsOf("characters")
      .filter((path) => path.endsWith(".png"))
      .map(async (path) => await stCardName(present(zip[path]))),
  );
  expect(names).toContain("Aria");
  const chats = pathsOf("chats");
  expect(nonEmpty(chats).every((path) => stChatHeaderAccepted(strFromU8(present(zip[path]))))).toBe(true);
  const worlds = pathsOf("worlds");
  expect(worlds).toContain(`${ST_EXPORT_PROFILE_DIR}worlds/Eldoria.json`);
  expect(nonEmpty(worlds).every((path) => stWorldAccepted(strFromU8(present(zip[path]))))).toBe(true);
  expect(strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}user/files/Field notes.txt`]))).toBe("The ford floods at dusk.");
  // The chat-completion preset reads back through the preset import (`public/scripts/openai.js` `onPresetImportFileChange`
  // takes any JSON object; this app's port of its reading is the contract importer).
  expect(pathsOf("presets")).toContain(`${ST_EXPORT_PROFILE_DIR}OpenAI Settings/Plain.json`);
  expect(nonEmpty(pathsOf("presets")).every((path) => tryImportStChatCompletionPreset(JSON.parse(strFromU8(present(zip[path])))).ok)).toBe(true);
  expect(nonEmpty(pathsOf("themes")).map((path) => stThemeSchema.parse(JSON.parse(strFromU8(present(zip[path])))).name)).toContain("Dusk");
  expect(pathsOf("backgrounds")).toContain(`${ST_EXPORT_PROFILE_DIR}backgrounds/sky.png`);
  // A card is filed under its handle, the name the group roster, the tag map and the chat folders all key by.
  // The group room is a SillyTavern group whose transcript sits in `group chats/`, never a solo chat of its first member.
  const [groupPath] = nonEmpty(pathsOf("groups").filter((path) => path.includes("/groups/")));
  const group = stGroupSchema.parse(JSON.parse(strFromU8(present(zip[present(groupPath)]))));
  expect(group.members.toSorted((a, b) => a.localeCompare(b))).toEqual(["aria.png", "lisa.png"]);
  expect(nonEmpty(group.members).every((member) => zip[`${ST_EXPORT_PROFILE_DIR}characters/${member}`] !== undefined)).toBe(true);
  const groupChat = strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}group chats/${present(group.chats[0])}.jsonl`]));
  expect(stChatHeaderAccepted(groupChat)).toBe(true);
  expect(groupChat).toContain("Aria and Lisa share the lamp.");
  expect(nonEmpty(chats).some((path) => strFromU8(present(zip[path])).includes("Aria and Lisa share the lamp."))).toBe(false);
  // The persona carries its own image; the one with none is named, never given stand-in art.
  const stSettings = stSettingsSchema.parse(JSON.parse(strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}${ST_SETTINGS_FILE}`]))));
  expect(Object.values(stSettings["power_user"].personas)).toEqual(["Bob"]);
  const [avatar] = Object.keys(stSettings["power_user"].personas);
  expect(zip[`${ST_EXPORT_PROFILE_DIR}User Avatars/${present(avatar)}`]).toEqual(files["User Avatars/bob.png"]);
  expect(report.left).toEqual(expect.arrayContaining([{ kind: "persona", item: "Nobody", reason: "persona-without-art" }]));
  // The card's tag rides SillyTavern's tag map, keyed by the card file.
  const hero = present(stSettings.tags.find(({ name }) => name === "Hero"));
  expect(stSettings["tag_map"]["aria.png"]).toEqual([hero.id]);
  expect(report.left.filter(({ reason }) => reason === "unreadable")).toEqual([]);
});

test("the dry run writes nothing and answers the report the zip carries", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, profile(root)));
  const before = await tableContents(root);

  const report = await exportDryRun(root);

  expect(await tableContents(root)).toEqual(before);
  const zip = await exportedZip(root);
  expect(report).toEqual(stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE])))));
  expect(report.files.length).toBeGreaterThan(0);
});

test("the exported tree imports back as the same library, Data Bank scopes and gallery included", async () => {
  await using source = await harness();
  await finishRun(source, await admit(source, profile(source)));
  const zip = await exportedZip(source);
  const report = stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE]))));
  const exportedOf = (kind: keyof typeof ST_EXPORT_DOORS, ext: string): number =>
    report.files.filter((file) => file.kind === kind && file.path.endsWith(ext)).length;
  const tree = profileTree(zip);

  await using target = await harness();
  const result = await finishRun(target, await admit(target, tree));

  // The owner's default characters, books and galleries ride beside the imported ones.
  expect(result.found).toMatchObject({
    characters: exportedOf("characters", ".png"),
    // A group's transcript is a chat of its room.
    chats: exportedOf("chats", ".jsonl") + exportedOf("groups", ".jsonl"),
    worlds: exportedOf("worlds", ".json"),
    documents: exportedOf("documents", ".txt"),
    gallery: exportedOf("gallery", ""),
    presets: exportedOf("presets", ".json"),
    themes: exportedOf("themes", ".json"),
    backgrounds: exportedOf("backgrounds", ""),
    groups: report.files.filter((file) => file.path.includes("/groups/")).length,
  });
  expect(exportedOf("documents", ".txt")).toBe(1);
  // Export, import, export is a fixed point: the book, the Data Bank file, the preset, the theme and the persona's
  // avatar come back byte for byte.
  const again = await exportedZip(target);
  for (const leaf of ["worlds/Eldoria.json", "user/files/Field notes.txt", "OpenAI Settings/Plain.json", "themes/Dusk.json", "User Avatars/Bob.png"]) {
    const path = `${ST_EXPORT_PROFILE_DIR}${leaf}`;
    expect(strFromU8(present(again[path])), path).toBe(strFromU8(present(zip[path])));
  }
  const principal = await target.principalFor(target.ownerId);
  const signal = new AbortController().signal;
  const [document] = (await target.services.databank.list({ signal, principal })).items;
  const scopes = await target.services.databank.listAttachments({ signal, principal, id: present(document).id });
  expect(present(document).name).toBe("Field notes");
  expect(scopes.global).toBe(true);
  expect(scopes.characters.map(({ name }) => name)).toEqual(["Aria"]);
});

test("the SillyTavern format refuses a kinds filter, since SillyTavern pairs chats with their cards by folder", async () => {
  await using root = await harness();

  const response = await root.http.request(`${stProfileExportPath(false)}&kinds=character`);

  expect(response.status).toBe(BAD_REQUEST);
});
