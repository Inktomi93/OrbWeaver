// The `@orb/default-content` pins (D160). Three properties the character/persona/demo-chat seeders stand
// on, and that nothing else in the tree asserts:
//
//   1. BYTE IDENTITY of everything this package ships. The sha256 map below is the whole shipped inventory,
//      captured at the package move from the files' pre-move home
//      (`packages/server/src/entry/boot/seed-assets/`) — so a green here is the MOVE's own receipt that the
//      relocation changed no seeded byte. Two of these hashes were independently recorded before the move
//      by the 2026-08-13 repository audit's read receipts (`assistant.png`, `ashen-spire.jsonl`), which is
//      the outside witness that this map was not simply re-blessed from whatever happened to be on disk.
//   2. THE INVENTORY IS EXACT IN BOTH DIRECTIONS — a file added to `avatars/`/`demo-chats/` without a row,
//      or a row whose file disappeared, reds. A seeded user's library is exactly what this package ships;
//      an untracked addition would reach every fresh install with nobody having reviewed the bytes.
//   3. AN ABSENT HANDLE/SLUG IS AN ABSENCE, NOT A THROW — the `null` arm both readers answer with, which is
//      what lets one missing file skip ONE seed item instead of failing the whole seed pass.
//
// The hashes are VALUES, not a golden file: a deliberate content edit is meant to red exactly one row here
// and be re-blessed in the same commit that edits it, which is the only place a reviewer can see that the
// bytes a fresh user receives changed.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSeedAvatar, readSeedBackground, readSeedDemoChat, SEED_AVATAR_MIME, SEED_BACKGROUND_MIME, SEED_BACKGROUND_PLATES } from "@orb/default-content";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../support/fixtures.ts";

const CONTENT_DIR = fileURLToPath(new URL("../../packages/default-content/", import.meta.url));

/** sha256 of every shipped avatar PNG, by handle — the pack the default-character + persona seeders lay down. */
const AVATAR_SHA256: Readonly<Record<string, string>> = {
  assistant: "4204316e1c6d4d846f60a8784f9c54f4c9faf8d35257af89686f6284f7e328fa",
  birdie: "d91d20234b6277fe0087c15343d1bac55b81f657e981dd996432c8ca6fa50aba",
  calamity: "cc8cac65e3a91c934e51150fa31053f9bb6f9a48510725da3c2cda6ea931ba75",
  elias: "9b67380721584258ea541edbbea2a9ac8f05d94133ecfd9275f4ac27c9c0d66b",
  hana: "016ffe3a28c43408148cf11c829bb146a85d7a42e83888ee7f1234a6b4f92f49",
  "jfc-coder": "a90d64fd073ac2a6b85238fcd54319c2ea31d640bfdd1b2cbde197508d16214a",
  kohaku: "7981639888cf4d33840d90e5293a50d192c0146e8e404cbf88a615d2fa08e08a",
  morgatha: "3d8fe8670f99b01c9f427c369bf97aba7fbb0350310b457ea34642947c5c38c6",
  niko: "3d9644b4c03dd495584a44a37875fda3fc0949c1d3eb1a180bce6f3e253e518d",
  // Not a character — the default PERSONA's art, read through the same reader under the `persona-you` key.
  "persona-you": "5c9fbf771f53b6c9bf70f545b7ee9be18da4aec035555f97f172150932833433",
  sabine: "4cad41410b4f371cfec28f8cc7e4a0198dbf0a27336fc56d56e11440a7fe54a6",
};

/** sha256 of every shipped SCENE PLATE, by slug — the per-character backgrounds the background seeder lifts
 *  into owned `background` assets. These hashes are ALSO the CAS content hashes those assets carry (the CAS
 *  key is `sha256Hex` of the stored bytes), which is what lets a seeded plate be recognised later by content
 *  rather than by a slug field the library entry does not have. */
const BACKGROUND_SHA256: Readonly<Record<string, string>> = {
  "assistant-bg": "664bc22f5de644e2beebe4e1a1ed4a133700438b6990280a9e986020209579ff",
  "birdie-bg": "ea26f236b800d2ab2a26a5efbb26aff28123e1971af2165a30d740a7ac07088b",
  "calamity-bg": "5a7b1dfa064ce07e685e317adbc39f5b3429f1b4a0d29193bdd005e7cf02f1a5",
  "elias-bg": "c64d3f76f84f04ff9532ed0239e31928b4b4f01553195d2ebc67a07447988bfc",
  "hana-bg": "b8b621fe027d0f0b2b3bf77f4694ca5cb13c20f5d15c9453daa0a98e3624b4a8",
  "jfc-coder-bg": "c664d92d99ce15bf9d8d2ae538a4ef626ef9121c85475191b295f394fa2f1b3b",
  "kohaku-bg": "7706c2ad41d77edbf68149cc6f2214c7bd5852d063e1a81310874203feca3444",
  "morgatha-bg": "e1c2de1874fec210541de9e4b6f0c7bd3a882a1c1c82a7c9113c861c75c8198b",
  "niko-bg": "dd2d9a620d8edef070c21d0fa6bb65c0c4a4ecd3e9282c2b36ff97e5558cbe60",
  "sabine-bg": "60da470266cb859582c73364e937d354a8a6ebfcf643b631cb0614677ac81b7e",
};

/** sha256 of every shipped EXAMPLE transcript, by slug — verbatim export-verb output, never hand-edited. */
const DEMO_CHAT_SHA256: Readonly<Record<string, string>> = {
  "ashen-spire": "1605a473c6003793bcdb8e61ac7bddd5c2b32db83a52fae20a81c3ff0161f28d",
  "birdie-rust": "e7a74bfd5eb9119ccfafb050830ee99f22172367ab20f4f816aeaba487de11b9",
  "elias-marginalia": "a966b00c84ec4b5e9452464225507dfc987c859b976be036ceb7424edf65e7da",
  "hana-bench": "15071df878ce2a72a30e5bff941814a242f0a3f21d46a3d706c0bcd9848e7823",
  "midnight-run": "bf6fa486371130c75367973f6a58fd2d5aa76c43db7e7e10b68ce2138e0f1cd6",
  "second-opinion": "26a341093bc5d946f4c47d55fb067c535aa36c7403bdd547f51c990c8bc1b5cb",
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function shippedNames(dir: string, extension: string): Promise<string[]> {
  const entries = await readdir(join(CONTENT_DIR, dir), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name.slice(0, -extension.length))
    .toSorted();
}

test("the shipped avatar inventory is exactly the pinned one", async () => {
  expect(await shippedNames("avatars", ".png")).toEqual(Object.keys(AVATAR_SHA256).toSorted());
});

test("the shipped transcript inventory is exactly the pinned one", async () => {
  expect(await shippedNames("demo-chats", ".jsonl")).toEqual(Object.keys(DEMO_CHAT_SHA256).toSorted());
});

test("every shipped avatar reads back as the bytes it shipped with, through the package reader", async () => {
  for (const [handle, digest] of Object.entries(AVATAR_SHA256)) {
    const art = await readSeedAvatar(castId<CharacterHandle>(handle));
    expect(art, `${handle} ships no avatar`).not.toBeNull();
    expect(art?.mime).toBe(SEED_AVATAR_MIME);
    expect(sha256(art?.bytes ?? new Uint8Array()), `${handle}'s seeded avatar bytes changed`).toBe(digest);
  }
});

test("every shipped transcript reads back as the bytes it shipped with, through the package reader", async () => {
  for (const [slug, digest] of Object.entries(DEMO_CHAT_SHA256)) {
    const transcript = await readSeedDemoChat(slug);
    expect(transcript, `${slug} ships no transcript`).not.toBeNull();
    expect(sha256(transcript ?? ""), `${slug}'s seeded transcript bytes changed`).toBe(digest);
  }
});

test("the reader's bytes are the file's bytes (no decode/re-encode in the path)", async () => {
  // The avatars go through `assets.store({enforceMagic:true})`, which sniffs the magic bytes — a reader that
  // transcoded or truncated would seed art the store refuses, and the digest above alone cannot see whether
  // the digest and the file drifted together.
  const onDisk = await readFile(join(CONTENT_DIR, "avatars", "assistant.png"));
  const read = await readSeedAvatar(castId<CharacterHandle>("assistant"));
  expect(read?.bytes).toEqual(new Uint8Array(onDisk));
});

test("a handle or slug this package does not ship is an absence, never a throw", async () => {
  expect(await readSeedAvatar(castId<CharacterHandle>("no-such-default-character"))).toBeNull();
  expect(await readSeedDemoChat("no-such-demo-chat")).toBeNull();
  expect(await readSeedBackground("no-such-background")).toBeNull();
});

test("the shipped scene-plate inventory is exactly the pinned one", async () => {
  expect(await shippedNames("backgrounds", ".jpg")).toEqual(Object.keys(BACKGROUND_SHA256).toSorted());
});

test("the plate MANIFEST and the shipped files are the same set", async () => {
  // The manifest is what the seeder walks, so a plate on disk with no row seeds for nobody and a row with no
  // plate seeds a hole. Neither is visible from the sha map alone (which pins the FILES, not the manifest).
  expect(SEED_BACKGROUND_PLATES.map((plate) => plate.slug).toSorted()).toEqual(await shippedNames("backgrounds", ".jpg"));
});

test("every plate carries a non-empty display label, and no two share one", () => {
  // The label becomes the seeded `backgroundLibrary` entry's NAME — the only text a user sees for the plate
  // in the picker, so a blank or duplicated one is an unpickable row.
  const labels = SEED_BACKGROUND_PLATES.map((plate) => plate.label);
  expect(labels.every((label) => label.trim().length > 0)).toBe(true);
  expect(new Set(labels).size).toBe(labels.length);
});

test("every shipped plate reads back as the bytes it shipped with, through the package reader", async () => {
  for (const [slug, digest] of Object.entries(BACKGROUND_SHA256)) {
    const plate = await readSeedBackground(slug);
    expect(plate, `${slug} ships no scene plate`).not.toBeNull();
    expect(plate?.mime).toBe(SEED_BACKGROUND_MIME);
    expect(sha256(plate?.bytes ?? new Uint8Array()), `${slug}'s seeded plate bytes changed`).toBe(digest);
  }
});
