// The library export door's SillyTavern format writes the owner's library as a SillyTavern user directory: each
// file in the shape the SillyTavern door the report names for it takes, every row it leaves behind named with its
// reason, and its dry run answers the very report the zip carries while writing nothing. The tree a run writes
// imports back here as the same library.
// @subject packages/server/src/domain/export/verbs/export-st-profile.ts
// @subject packages/server/src/entry/http/export.ts

import type { StExportReport } from "@orb/contracts/import";
import {
  ST_EXPORT_DOORS,
  ST_EXPORT_DRY_RUN_QUERY,
  ST_EXPORT_FORMAT,
  ST_EXPORT_PROFILE_DIR,
  ST_EXPORT_REPORT_FILE,
  ST_SETTINGS_FILE,
  stExportReportSchema,
} from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { ID_PREFIX } from "@orb/kit/ids";
import { readCardChunk } from "@orb/kit/png-card-chunk";
import { nonEmpty, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import type { Files } from "./_st-tree-door.ts";
import { admit, attachmentOf, cardPng, chatOf, finishRun, harness, presetOf, settings, tableContents, WORLD } from "./_st-tree-door.ts";

const OK = 200;
const BAD_REQUEST = 400;
const NOTES = attachmentOf("notes.txt", "Field notes");

/** A SillyTavern profile with an item of each kind the export writes, and a preset it leaves behind. */
function profile(root: ServerTestHarness): Files {
  return {
    [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }, { attachments: [NOTES], ["character_attachments"]: { "Aria.png": [NOTES] } }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "chats/Aria/first.jsonl": chatOf("Aria lights the lamp."),
    "worlds/Eldoria.json": WORLD,
    "OpenAI Settings/Plain.json": presetOf("You narrate."),
    "user/files/notes.txt": "The ford floods at dusk.",
    "user/images/Aria/glade.png": new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
  };
}

function exportUrl(dryRun: boolean): string {
  return `${PORTABILITY_ROUTES.exportLibrary}?format=${ST_EXPORT_FORMAT}${dryRun ? `&${ST_EXPORT_DRY_RUN_QUERY}=1` : ""}`;
}

async function exported(root: ServerTestHarness): Promise<Readonly<Record<string, Uint8Array>>> {
  const response = await root.http.request(exportUrl(false));
  expect(response.status).toBe(OK);
  return unzipSync(new Uint8Array(await response.arrayBuffer()));
}

async function dryRunReport(root: ServerTestHarness): Promise<StExportReport> {
  const response = await root.http.request(exportUrl(true));
  expect(response.status).toBe(OK);
  return stExportReportSchema.parse(await response.json());
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

// SillyTavern's world import refuses a file with no `entries` (`src/endpoints/worldinfo.js:113`).
function stWorldAccepted(text: string): boolean {
  const world: unknown = JSON.parse(text);
  return typeof world === "object" && world !== null && "entries" in world;
}

test("each exported file has the shape the SillyTavern door its report names takes", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, profile(root)));

  const zip = await exported(root);
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
  // The preset has no SillyTavern writer yet, so the report names it instead of dropping it.
  expect(report.left).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "preset", reason: "no-writer" })]));
});

test("the dry run writes nothing and answers the report the zip carries", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, profile(root)));
  const before = await tableContents(root);

  const report = await dryRunReport(root);

  expect(await tableContents(root)).toEqual(before);
  const zip = await exported(root);
  expect(report).toEqual(stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE])))));
  expect(report.files.length).toBeGreaterThan(0);
});

test("the exported tree imports back as the same library, Data Bank scopes and gallery included", async () => {
  await using source = await harness();
  await finishRun(source, await admit(source, profile(source)));
  const zip = await exported(source);
  const report = stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE]))));
  const exportedOf = (kind: keyof typeof ST_EXPORT_DOORS, ext: string): number =>
    report.files.filter((file) => file.kind === kind && file.path.endsWith(ext)).length;
  const tree = profileTree(zip);

  await using target = await harness();
  const result = await finishRun(target, await admit(target, tree));

  // The owner's default characters, books and galleries ride beside the imported ones.
  expect(result.found).toMatchObject({
    characters: exportedOf("characters", ".png"),
    chats: exportedOf("chats", ".jsonl"),
    worlds: exportedOf("worlds", ".json"),
    documents: exportedOf("documents", ".txt"),
    gallery: exportedOf("gallery", ""),
  });
  expect(exportedOf("documents", ".txt")).toBe(1);
  // Export, import, export is a fixed point: the book and the Data Bank file come back byte for byte.
  const again = await exported(target);
  for (const path of [`${ST_EXPORT_PROFILE_DIR}worlds/Eldoria.json`, `${ST_EXPORT_PROFILE_DIR}user/files/Field notes.txt`]) {
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

  const response = await root.http.request(`${exportUrl(false)}&kinds=character`);

  expect(response.status).toBe(BAD_REQUEST);
});
