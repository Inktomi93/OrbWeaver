// @subject packages/contracts/src/character/index.ts
// @subject packages/kit/src/slug/index.ts
import { characterHandleSchema, deriveCharacterHandle, portableCharacterHandle } from "@orb/contracts/character";
import { slugifyHandle } from "@orb/kit/slug";
import { expect, test } from "@orb/testkit/node";

/** Names whose fold is easy to get wrong: NFKD expansions to separators and dots, controls, bidi formats,
 *  orphan marks, the fold's code-point ceiling, an uppercase NFKD output, and nothing foldable at all. */
// Built from code points so no invisible character sits in this source file.
const cp = (...points: readonly number[]): string => String.fromCodePoint(...points);
const HOSTILE_NAMES = [
  "..",
  `${cp(0xff_0e, 0xff_0e, 0xff_0f)}etc`,
  `a${cp(0)}b`,
  "line\r\nbreak",
  `${cp(0x20_2e)}evil${cp(0x20_2c)}`,
  `${cp(0x3_01)}leading mark`,
  "__group__chat",
  `${cp(0x21_0c)}ello`,
  cp(0x1_f4_09),
  cp(0xfd_fa),
  "x".repeat(300),
  cp(0x9_15, 0x9_3f).repeat(80),
] as const;

test("every handle the fold mints is inside the handle contract", () => {
  expect(HOSTILE_NAMES.filter((name) => !characterHandleSchema.safeParse(slugifyHandle(name)).success)).toEqual([]);
});

test("a stored handle outside the alphabet leaves the box as an in-alphabet handle, and one inside it is unchanged", () => {
  expect({
    hostile: HOSTILE_NAMES.filter((stored) => !characterHandleSchema.safeParse(portableCharacterHandle(stored)).success),
    kept: portableCharacterHandle("lantern-warden"),
  }).toEqual({ hostile: [], kept: "lantern-warden" });
});

test("a derived handle whose cut lands on a separator stays inside the alphabet", () => {
  const cap = characterHandleSchema.in.maxLength;
  if (cap === null) {
    throw new Error("the handle contract states no length cap");
  }
  const suffix = "-2";
  // The cut keeps `cap - suffix.length` units, which ends exactly on the source's separator.
  const source = characterHandleSchema.parse(`${"a".repeat(cap - suffix.length - 1)}-tail`.slice(0, cap));
  const derived = deriveCharacterHandle(source, suffix);
  expect({ valid: characterHandleSchema.safeParse(derived).success, withinCap: derived.length <= cap }).toEqual({ valid: true, withinCap: true });
});
