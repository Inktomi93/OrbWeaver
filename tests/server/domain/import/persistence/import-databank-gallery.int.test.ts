// A SillyTavern profile's Data Bank and character galleries import through the tree door. A Data Bank file lands once
// in the owner's Data Bank under every scope SillyTavern attached it under (the whole library, a card, a transcript),
// a switched-off file lands attached to nothing, and a file the index does not list, an index entry with no file and a
// name that leaves the plane import nothing. A gallery image lands in the gallery of every character whose folder holds
// it, by the card's name or its folder override, and a folder no card owns stores nothing. A second run writes neither.
// @subject packages/server/src/domain/import/loader/collect.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/databank/verbs/import-attached.ts
// @subject packages/server/src/domain/assets/verbs/import-gallery-image.ts
// @subject packages/server/src/primitives/serde/databank/index.ts

import { readFile } from "node:fs/promises";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { MAX_DATABANK_BYTES_FLOOR } from "@orb/contracts/settings";
import { galleryItems } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import type { Files } from "./_st-tree-door.ts";
import { admit, attachmentOf, cardPng, dryRun, finishRun, harness, settings } from "./_st-tree-door.ts";

const NOTES = "notes.txt";
const NOTES_PATH = `user/files/${NOTES}`;

/** A transcript whose chat metadata attaches these Data Bank entries, as SillyTavern saves a chat's own attachments. */
function chatAttaching(attachments: readonly Readonly<Record<string, unknown>>[]): string {
  return [
    JSON.stringify({ ["user_name"]: "Bob", ["character_name"]: "Aria", ["create_date"]: "2025-07-18@12h00m00s", ["chat_metadata"]: { attachments } }),
    JSON.stringify({ ["is_user"]: false, mes: "Aria reads the notes.", ["send_date"]: "2025-07-18@12h00m01s" }),
  ].join("\n");
}

function picture(root: ServerTestHarness): Uint8Array {
  return new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
}

async function characterId(root: ServerTestHarness, name: string): Promise<CharacterId> {
  const items = (await (await root.internalCallerFor(root.ownerId)).character.list({})).items.filter((item) => item.name === name);
  expect(items).toHaveLength(1);
  return present(items[0]).id;
}

async function documentsByName(
  root: ServerTestHarness,
): Promise<Map<string, Awaited<ReturnType<ServerTestHarness["services"]["databank"]["listAttachments"]>>>> {
  const principal = await root.principalFor(root.ownerId);
  const signal = new AbortController().signal;
  const { items } = await root.services.databank.list({ signal, principal });
  const out = new Map<string, Awaited<ReturnType<ServerTestHarness["services"]["databank"]["listAttachments"]>>>();
  for (const item of items) {
    out.set(item.name, await root.services.databank.listAttachments({ signal, principal, id: item.id }));
  }
  return out;
}

// The owner's default content seeds galleries of its own, so a test reads the rows its run added.
async function galleryAdded(root: ServerTestHarness, before: ReadonlySet<string> = new Set()): Promise<readonly (CharacterId | null)[]> {
  const rows = await root.db.select({ id: galleryItems.id, subject: galleryItems.subjectCharacterId }).from(galleryItems);
  return rows
    .filter((row) => !before.has(row.id))
    .map((row) => row.subject)
    .toSorted((a, b) => String(a).localeCompare(String(b)));
}

async function galleryIds(root: ServerTestHarness): Promise<ReadonlySet<string>> {
  const items = await root.services.assets.listGallery({ principal: await root.principalFor(root.ownerId), limit: 100 });
  return new Set(items.map((item) => item.galleryItemId));
}

async function reportOf(root: ServerTestHarness, files: Files): Promise<string> {
  const result = await finishRun(root, await admit(root, files));
  return await readFile(present(result.reportPath), "utf8");
}

test("a Data Bank file lands once under the library, card and transcript scopes SillyTavern attached it under", async () => {
  await using root = await harness();
  const entry = attachmentOf(NOTES, "Field notes");
  const files: Files = {
    [ST_SETTINGS_FILE]: settings({}, { attachments: [entry], ["character_attachments"]: { "Aria.png": [entry] } }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "chats/Aria/read.jsonl": chatAttaching([entry]),
    [NOTES_PATH]: "The ford floods at dusk.",
  };

  await finishRun(root, await admit(root, files));

  const [chat, ...otherChats] = (await root.services.chat.listChats({ principal: await root.principalFor(root.ownerId) })).items;
  expect(otherChats).toEqual([]);
  const documents = await documentsByName(root);
  expect([...documents.keys()]).toEqual(["Field notes"]);
  const scopes = present(documents.get("Field notes"));
  expect(scopes.global).toBe(true);
  expect(scopes.characters.map(({ id }) => id)).toEqual([await characterId(root, "Aria")]);
  expect(scopes.chats.map(({ id }) => id)).toEqual([present(chat).id]);
});

test("a switched-off Data Bank file lands attached to nothing and the report names it", async () => {
  await using root = await harness();
  const entry = attachmentOf(NOTES, "Field notes");
  const on = attachmentOf("kept.txt", "Kept");
  const files: Files = {
    [ST_SETTINGS_FILE]: settings({}, { attachments: [entry, on], ["disabled_attachments"]: [entry["url"]] }),
    [NOTES_PATH]: "The ford floods at dusk.",
    "user/files/kept.txt": "The mill is upstream.",
  };

  const report = await reportOf(root, files);

  const documents = await documentsByName(root);
  // The control: the file beside it keeps the library scope, so the switched-off file lost its scope by its flag.
  expect(present(documents.get("Kept")).global).toBe(true);
  expect(documents.get("Field notes")).toEqual({ global: false, characters: [], chats: [] });
  expect(report).toContain(NOTES_PATH);
  expect(report).not.toContain("user/files/kept.txt");
});

test("a file the Data Bank does not list, an entry with no file, a file that is not text and a name that leaves the plane import nothing", async () => {
  await using root = await harness();
  const files: Files = {
    [ST_SETTINGS_FILE]: settings(
      {},
      {
        attachments: [
          attachmentOf(NOTES, "Field notes"),
          attachmentOf("gone.txt", "Gone"),
          attachmentOf("scan.pdf", "Scan"),
          { url: "/user/files/../settings.json", name: "Escape" },
          { url: "/user/files/sub/nested.txt", name: "Nested" },
        ],
      },
    ),
    [NOTES_PATH]: "The ford floods at dusk.",
    "user/files/stray.txt": "Another extension's upload.",
    "user/files/scan.pdf": "%PDF-1.4",
    "user/files/sub/nested.txt": "A file below the plane.",
  };

  const preview = await dryRun(root, files);
  const report = await reportOf(root, files);

  expect([...(await documentsByName(root)).keys()]).toEqual(["Field notes"]);
  expect(preview.kinds.documents.items.map((item) => item.name)).toEqual(["Field notes"]);
  const skipped = preview.skipped.items.map((item) => item.source.path);
  // An entry whose URL leaves the plane or descends below it names no Data Bank file, so it is neither read nor named.
  expect(skipped.filter((path) => path.startsWith("user/files/")).toSorted()).toEqual(["user/files/gone.txt", "user/files/scan.pdf", "user/files/stray.txt"]);
  for (const path of ["user/files/stray.txt", "user/files/gone.txt", "user/files/scan.pdf"]) {
    expect(report).toContain(path);
  }
});

test("a gallery image lands under the character its folder belongs to, by name or by override, and a folder no card owns stores nothing", async () => {
  await using root = await harness();
  const files: Files = {
    [ST_SETTINGS_FILE]: settings({}, { gallery: { folders: { "Bram.png": "Bram's pictures" } } }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "characters/Bram.png": cardPng(root, "Bram"),
    "user/images/Aria/glade.png": picture(root),
    "user/images/Bram's pictures/marsh.png": picture(root),
    // Bram's own name is not his folder once an override names another.
    "user/images/Bram/ignored.png": picture(root),
    "user/images/Nobody/lost.png": picture(root),
  };

  const preview = await dryRun(root, files);
  const before = await galleryIds(root);
  await finishRun(root, await admit(root, files));

  expect(await galleryAdded(root, before)).toEqual([await characterId(root, "Aria"), await characterId(root, "Bram")].toSorted((a, b) => a.localeCompare(b)));
  expect(preview.kinds.gallery.items.map((item) => item.name).toSorted()).toEqual(["Aria: glade", "Bram: marsh"]);
  expect(preview.skipped.items.map((item) => item.source.path)).toEqual(expect.arrayContaining(["user/images/Bram/", "user/images/Nobody/"]));
});

test("a second run of the same profile writes no Data Bank file and no gallery row, and its preview says so", async () => {
  await using root = await harness();
  const files: Files = {
    [ST_SETTINGS_FILE]: settings({}, { attachments: [attachmentOf(NOTES, "Field notes")] }),
    "characters/Aria.png": cardPng(root, "Aria"),
    [NOTES_PATH]: "The ford floods at dusk.",
    "user/images/Aria/glade.png": picture(root),
  };
  const before = await galleryIds(root);
  const first = await dryRun(root, files);
  await finishRun(root, await admit(root, files));
  const documents = await documentsByName(root);
  const gallery = await galleryAdded(root, before);

  const second = await dryRun(root, files);
  await finishRun(root, await admit(root, files));

  // The control: the first preview counted one write of each, so the second's library verdict is the run's own.
  expect(first.kinds.documents.counts).toMatchObject({ writes: 1, inLibrary: 0 });
  expect(first.kinds.gallery.counts).toMatchObject({ writes: 1, inLibrary: 0 });
  expect(second.kinds.documents.counts).toMatchObject({ writes: 0, inLibrary: 1 });
  expect(second.kinds.gallery.counts).toMatchObject({ writes: 0, inLibrary: 1 });
  expect(await documentsByName(root)).toEqual(documents);
  expect(await galleryAdded(root, before)).toEqual(gallery);
  expect(gallery).toEqual([await characterId(root, "Aria")]);
});

test("a profile's Data Bank file over the admin's Data Bank limit is named and stores nothing, and one under it lands", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal, partial: { maxDatabankBytes: MAX_DATABANK_BYTES_FLOOR } });
  const over = "x".repeat(MAX_DATABANK_BYTES_FLOOR + 1);
  const files: Files = {
    [ST_SETTINGS_FILE]: settings({}, { attachments: [attachmentOf("big.txt", "Big notes"), attachmentOf(NOTES, "Field notes")] }),
    "user/files/big.txt": over,
    [NOTES_PATH]: "The ford floods at dusk.",
  };

  // The preview judges by the same limit, so it promises only the write the run makes.
  const preview = await dryRun(root, files);
  const result = await finishRun(root, await admit(root, files));

  expect(preview.kinds.documents.counts).toMatchObject({ writes: 1 });
  expect(preview.skipped.items.map((item) => item.source.path)).toContain("user/files/big.txt");
  expect([...(await documentsByName(root)).keys()]).toEqual(["Field notes"]);
  const report = await readFile(present(result.reportPath), "utf8");
  expect(report).toContain("big.txt");
});
