// Every path the SillyTavern export writes from a stored name stays one safe file name in its directory: no separator
// or dot-only segment, no control, DEL or bidirectional mark, no Windows device name, at most the name byte limit with
// its collision suffix, and no two paths that a Windows or macOS volume holds as one.
// @subject packages/server/src/domain/export/verbs/export-st-profile.ts
// @subject packages/server/src/primitives/st-filename/index.ts

import { ST_EXPORT_PROFILE_DIR, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { ID_PREFIX } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { strFromU8 } from "fflate";
import { z } from "zod";
import { exportedZip, harness } from "./_st-tree-door.ts";

const PNG_MIME = "image/png";
const MAX_NAME_BYTES = 255;
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x20_2e);
const DEL = String.fromCodePoint(0x7f);
const COMBINING_ACUTE = String.fromCodePoint(0x3_01);
// Four UTF-8 bytes each, so a name within the persona limit runs past the file name byte limit.
const WIDE_LETTER = String.fromCodePoint(0x1_d4_01);
const WIDE_NAME_LETTERS = 70;
const ENCODER = new TextEncoder();
const C0_END = 0x1f;
const DEL_CODE = 0x7f;
const C1_END = 0x9f;
const BIDI_RANGES = [
  [0x20_2a, 0x20_2e],
  [0x20_66, 0x20_69],
] as const;
const WINDOWS_ILLEGAL = new Set(["\\", ":", "*", "?", '"', "<", ">", "|"]);

// A character no written file name may hold: a control, DEL, a bidirectional mark or one Windows refuses.
function isUnsafe(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code <= C0_END || (code >= DEL_CODE && code <= C1_END) || BIDI_RANGES.some(([from, to]) => code >= from && code <= to) || WINDOWS_ILLEGAL.has(char);
}

// A Windows or macOS volume holds these as one name: the same letters in either normalization form or letter case.
function folded(path: string): string {
  return path.normalize("NFC").toLowerCase();
}
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/iu;
const AVATAR_DIR = "User Avatars/";

// The persona names a library can hold whose file names would leave their folder, hide their extension, exceed the
// name limit or collide on a folding volume.
const HOSTILE_NAMES = [
  "../../escape",
  "back\\slash",
  "con",
  `invoice${RIGHT_TO_LEFT_OVERRIDE}gnp.exe`,
  `del${DEL}name`,
  WIDE_LETTER.repeat(WIDE_NAME_LETTERS),
  WIDE_LETTER.repeat(WIDE_NAME_LETTERS),
  "Café",
  `Cafe${COMBINING_ACUTE}`,
  "Wren",
  "WREN",
];

const personaListSchema = z.object({ ["power_user"]: z.object({ personas: z.record(z.string(), z.string()) }) });

test("every persona avatar the export writes has one safe file name, however hostile or alike the persona names", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  for (const name of HOSTILE_NAMES) {
    const art = await root.services.assets.store({
      principal,
      bytes: new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
      kind: "avatar",
      mime: PNG_MIME,
      enforceMagic: true,
    });
    await root.services.persona.create({ principal, input: { name, description: "Hostile.", avatarAssetId: art.assetId } });
  }

  const zip = await exportedZip(root);

  const paths = Object.keys(zip).map((path) => path.slice(ST_EXPORT_PROFILE_DIR.length));
  const avatars = paths.filter((path) => path.startsWith(AVATAR_DIR));
  // The control: every persona carried its own avatar, so a name that vanished would show here.
  expect(avatars).toHaveLength(HOSTILE_NAMES.length);
  const settings = personaListSchema.parse(JSON.parse(strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}${ST_SETTINGS_FILE}`]))));
  expect(Object.keys(settings["power_user"].personas).toSorted()).toEqual(avatars.map((path) => path.slice(AVATAR_DIR.length)).toSorted());
  for (const path of avatars) {
    const leaf = path.slice(AVATAR_DIR.length);
    const unsafe: string[] = [];
    for (const char of leaf) {
      if (isUnsafe(char)) {
        unsafe.push(char);
      }
    }
    expect(unsafe, path).toEqual([]);
    expect(leaf, path).not.toContain("/");
    expect(leaf.replaceAll(".", ""), path).not.toBe("");
    expect(leaf, path).not.toMatch(WINDOWS_DEVICE);
    expect(ENCODER.encode(leaf).length, path).toBeLessThanOrEqual(MAX_NAME_BYTES);
  }
  expect(new Set(paths.map(folded)).size).toBe(paths.length);
});
