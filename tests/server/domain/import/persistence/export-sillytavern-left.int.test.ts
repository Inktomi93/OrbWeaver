// The SillyTavern export carries each row SillyTavern has a home for and names every other one with its reason: a Data
// Bank file attached only to a chat rides that chat's header, a Data Bank file nothing lists and a picture no
// character holds are named, a transcript gone by the time the zip writes it is named and never written as an empty
// file, and two personas that share a name each carry their own avatar.
// @subject packages/server/src/domain/export/verbs/export-st-profile.ts
// @subject packages/server/src/entry/http/export.ts

import { Buffer } from "node:buffer";
import { ST_EXPORT_PROFILE_DIR, ST_EXPORT_REPORT_FILE, ST_SETTINGS_FILE, stExportReportSchema, stProfileExportPath } from "@orb/contracts/import";
import { ID_PREFIX } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import type { Files } from "./_st-tree-door.ts";
import { admit, attachmentOf, cardPng, chatOf, exportDryRun, exportedZip, finishRun, harness, settings } from "./_st-tree-door.ts";

const NOTES = attachmentOf("notes.txt", "Ford notes");
const DOCUMENT_MIME = "text/plain";
const PNG_MIME = "image/png";

// SillyTavern's chat header: `chat_metadata.attachments` lists the Data Bank files attached to that chat.
const stHeaderSchema = z.object({ ["chat_metadata"]: z.object({ attachments: z.array(z.object({ url: z.string(), name: z.string() })).optional() }) });
const stSettingsSchema = z.object({
  ["power_user"]: z.object({ personas: z.record(z.string(), z.string()) }),
  ["extension_settings"]: z.object({ attachments: z.array(z.object({ url: z.string() })) }),
});

function zipReport(zip: Readonly<Record<string, Uint8Array>>): ReturnType<typeof stExportReportSchema.parse> {
  return stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE]))));
}

test("a Data Bank file attached only to a chat rides that chat's header and its file, and no library list", async () => {
  await using root = await harness();
  const header = JSON.stringify({
    ["user_name"]: "Bob",
    ["character_name"]: "Aria",
    ["create_date"]: "2025-07-18@12h00m00s",
    ["chat_metadata"]: { attachments: [NOTES] },
  });
  await finishRun(
    root,
    await admit(root, {
      [ST_SETTINGS_FILE]: settings({}),
      "characters/Aria.png": cardPng(root, "Aria"),
      "chats/Aria/ford.jsonl": [header, ...chatOf("Aria reads the notes.").split("\n").slice(1)].join("\n"),
      "user/files/notes.txt": "The ford floods at dusk.",
    }),
  );

  const zip = await exportedZip(root);

  const [chatPath] = Object.keys(zip).filter((path) => path.startsWith(`${ST_EXPORT_PROFILE_DIR}chats/aria/`));
  const stHeader = stHeaderSchema.parse(JSON.parse(present(strFromU8(present(zip[present(chatPath)])).split("\n")[0])));
  const [attached] = present(stHeader["chat_metadata"].attachments);
  expect(present(attached).name).toBe("Ford notes");
  expect(strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}${present(attached).url.slice(1)}`]))).toBe("The ford floods at dusk.");
  const stSettings = stSettingsSchema.parse(JSON.parse(strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}${ST_SETTINGS_FILE}`]))));
  expect(stSettings["extension_settings"].attachments).toEqual([]);
  expect(zipReport(zip).left.filter(({ kind }) => kind === "databank")).toEqual([]);
});

test("a Data Bank file nothing lists and a picture no character holds are named with no SillyTavern home and not written", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const signal = new AbortController().signal;
  await root.services.databank.upload({ principal, signal, bytes: new TextEncoder().encode("Loose notes."), mime: DOCUMENT_MIME, name: "Loose notes" });
  const picture = await root.services.assets.store({
    principal,
    bytes: new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
    kind: "gallery",
    mime: PNG_MIME,
    enforceMagic: true,
  });
  await root.services.assets.addToGallery({ principal, assetId: picture.assetId });

  const zip = await exportedZip(root);

  expect(zipReport(zip).left).toEqual(
    expect.arrayContaining([
      { kind: "databank", item: "Loose notes", reason: "no-sillytavern-home" },
      { kind: "gallery", item: picture.hash, reason: "no-sillytavern-home" },
    ]),
  );
  expect(Object.keys(zip).filter((path) => path.includes("Loose notes") || path.includes(picture.hash))).toEqual([]);
  expect(await exportDryRun(root)).toEqual(zipReport(zip));
});

test("a transcript gone by the time the zip writes it is named and never written as an empty file", async () => {
  await using root = await harness();
  const names = ["Aria", "Lisa", "Tess"];
  const files = new Map<string, Files[string]>();
  for (const name of names) {
    files.set(`characters/${name}.png`, cardPng(root, name));
    files.set(`chats/${name}/talk.jsonl`, chatOf(`${name} talks.`));
  }
  await finishRun(root, await admit(root, Object.fromEntries(files)));
  const principal = await root.principalFor(root.ownerId);
  const chatPaths = (await exportDryRun(root)).files.filter(({ kind }) => kind === "chats").map(({ path }) => path);
  const [firstPath] = chatPaths;
  const lastPath = present(chatPaths.at(-1));
  expect(lastPath).not.toBe(firstPath);
  const chatId = present(lastPath.split("/").at(-1)).replace(".jsonl", "");
  const chat = present((await root.services.chat.listChats({ principal })).items.find((item) => item.id === chatId));
  const response = await root.http.request(stProfileExportPath(false));
  const reader: ReadableStreamDefaultReader<Uint8Array> = present(response.body).getReader();
  const chunks: Uint8Array[] = [];
  const latin1 = new TextDecoder("latin1");

  // A zip entry's local header carries its path. Once the first transcript's header is read the rooms are listed, and
  // the stream pulls the next entry only when this one is read through.
  let listed = false;
  while (!listed) {
    const chunk = present((await reader.read()).value);
    chunks.push(chunk);
    listed = latin1.decode(chunk).includes(present(firstPath));
  }
  await root.services.chat.delete({ principal, chatId: chat.id });
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    chunks.push(chunk.value);
  }

  const zip = unzipSync(Buffer.concat(chunks));
  expect(zip[present(firstPath)]).toBeDefined();
  expect(zip[lastPath]).toBeUndefined();
  expect(zipReport(zip).left).toEqual(expect.arrayContaining([{ kind: "chat", item: chat.title ?? chat.id, reason: "unreadable" }]));
});

test("two personas that share a name each carry their own avatar", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const art = await Promise.all(
    [0, 1].map(
      async () =>
        await root.services.assets.store({
          principal,
          bytes: new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
          kind: "avatar",
          mime: PNG_MIME,
          enforceMagic: true,
        }),
    ),
  );
  for (const [index, stored] of art.entries()) {
    await root.services.persona.create({ principal, input: { name: "Wren", description: `Wren the ${String(index)}.`, avatarAssetId: stored.assetId } });
  }

  const zip = await exportedZip(root);

  const stSettings = stSettingsSchema.parse(JSON.parse(strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}${ST_SETTINGS_FILE}`]))));
  const avatars = Object.entries(stSettings["power_user"].personas).filter(([, name]) => name === "Wren");
  expect(avatars).toHaveLength(2);
  const written = avatars.map(([file]) => zip[`${ST_EXPORT_PROFILE_DIR}User Avatars/${file}`]);
  expect(written).toEqual(expect.arrayContaining([expect.anything(), expect.anything()]));
  expect(new Set(written.map((bytes) => Buffer.from(present(bytes)).toString("base64"))).size).toBe(2);
});
