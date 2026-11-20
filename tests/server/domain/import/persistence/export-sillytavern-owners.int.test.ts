// A second account's rows never reach the owner's SillyTavern export or decide the owner's import preview: the export
// carries only the caller's cards, personas, Data Bank and gallery, and a Data Bank file another account already holds
// still counts as a write for the owner.
// @subject packages/server/src/domain/export/verbs/st-profile-reads.ts
// @subject packages/server/src/domain/databank/persistence/portability-write.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { ST_EXPORT_PROFILE_DIR, ST_EXPORT_REPORT_FILE, ST_SETTINGS_FILE, stExportReportSchema } from "@orb/contracts/import";
import { ID_PREFIX } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { strFromU8 } from "fflate";
import type { Files } from "./_st-tree-door.ts";
import { attachmentOf, cardPng, dryRun, exportDryRun, exportedZip, harness, settings } from "./_st-tree-door.ts";

const PNG_MIME = "image/png";
const DOCUMENT_MIME = "text/plain";
const OTHER = "Quill";
const OTHER_NOTES = "Quill's ledger";
const OTHER_HANDLE = "quill";
const NOTES_TEXT = "The ford floods at dusk.";

async function seedOtherAccount(root: ServerTestHarness): Promise<void> {
  const principal = await root.principalFor((await seedUser(root.db, {}, root.idSource)).id);
  const signal = new AbortController().signal;
  const card = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: OTHER_HANDLE, name: OTHER, description: "Keeps the ledger." }),
  });
  const picture = (kind: "avatar" | "gallery"): ReturnType<ServerTestHarness["services"]["assets"]["store"]> =>
    root.services.assets.store({
      principal,
      bytes: new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
      kind,
      mime: PNG_MIME,
      enforceMagic: true,
    });
  const gallery = await picture("gallery");
  await root.services.assets.addToGallery({ principal, assetId: gallery.assetId, subjectCharacterId: card.id });
  await root.services.persona.create({ principal, input: { name: OTHER, description: "Another account.", avatarAssetId: (await picture("avatar")).assetId } });
  await root.services.databank.upload({
    principal,
    signal,
    bytes: new TextEncoder().encode(NOTES_TEXT),
    mime: DOCUMENT_MIME,
    name: OTHER_NOTES,
    destination: { kind: "global" },
  });
}

test("the owner's SillyTavern export carries none of another account's cards, personas, Data Bank or gallery", async () => {
  await using root = await harness();
  await seedOtherAccount(root);
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "lantern", name: "Lantern", description: "Keeps the light." }),
  });

  const zip = await exportedZip(root);

  // The control: the owner's own card is carried, so an empty export would fail here.
  expect(zip[`${ST_EXPORT_PROFILE_DIR}characters/lantern.png`]).toBeDefined();
  expect(Object.keys(zip).filter((path) => path.toLowerCase().includes(OTHER_HANDLE))).toEqual([]);
  const text = Object.values(zip).map((bytes) => strFromU8(bytes, true));
  expect(text.filter((body) => body.includes(OTHER) || body.includes(NOTES_TEXT))).toEqual([]);
  // Neither report names another account's row, not even as one it could not read.
  const report = stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE]))));
  const dryRunReport = await exportDryRun(root);
  for (const { files, left } of [report, dryRunReport]) {
    expect(files.filter(({ path }) => path.toLowerCase().includes(OTHER_HANDLE))).toEqual([]);
    expect(left.filter(({ item }) => item.toLowerCase().includes(OTHER_HANDLE))).toEqual([]);
  }
});

test("a Data Bank file another account already holds still counts as a write in the owner's import preview", async () => {
  await using root = await harness();
  await seedOtherAccount(root);
  const files: Files = {
    [ST_SETTINGS_FILE]: settings({}, { attachments: [attachmentOf("notes.txt", "Field notes")] }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "user/files/notes.txt": NOTES_TEXT,
  };

  const preview = await dryRun(root, files);

  expect(preview.kinds.documents.counts).toMatchObject({ writes: 1, inLibrary: 0 });
});
