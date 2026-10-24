// @subject packages/contracts/src/character/index.ts
// @subject packages/kit/src/slug/index.ts
import { characterHandleSchema, deriveCharacterHandle, portableCharacterHandle } from "@orb/contracts/character";
import { admitsHandle } from "@orb/kit/handle-key";
import { SLUG_HANDLE_PATTERN, slugifyHandle } from "@orb/kit/slug";
import { expect, test } from "@orb/testkit/node";

const MAX_CODE_POINT = 0x10_ff_ff;
const SURROGATES = { first: 0xd8_00, last: 0xdf_ff } as const;
// D257's refusal list as its Decision states it: default-ignorables, controls, format characters, line and
// paragraph separators, every space but U+0020, and the two blank-rendering symbols.
const D257_UNSEEN = /[[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}\u{2800}\u{1D159}]--\x20]/v;
const BLANK = /\p{White_Space}/v;

function d257Unseen(): readonly string[] {
  const out: string[] = [];
  for (let point = 0; point <= MAX_CODE_POINT; point += 1) {
    const char = point >= SURROGATES.first && point <= SURROGATES.last ? "" : String.fromCodePoint(point);
    if (char !== "" && D257_UNSEEN.test(char)) {
      out.push(char);
    }
  }
  return out;
}

const hex = (char: string): string => (char.codePointAt(0) ?? 0).toString(16);

test("the handle alphabet refuses every code point D257 refuses as unseen, and the fold drops or separates each one", () => {
  const unseen = d257Unseen();
  const named = (chars: readonly string[]): readonly string[] => chars.map(hex);
  expect({
    // The enumeration is D257's own: the users-handle admission refuses each of these inside a Latin handle.
    admittedByD257: named(unseen.filter((char) => admitsHandle(`ab${char}cd`))),
    admittedByAlphabet: named(unseen.filter((char) => SLUG_HANDLE_PATTERN.test(`ab${char}cd`))),
    // An invisible code point vanishes from the fold; a blank one still separates words.
    invisibleNotDropped: named(unseen.filter((char) => !BLANK.test(char) && slugifyHandle(`ab${char}cd`) !== "abcd")),
    blankNotSeparated: named(unseen.filter((char) => BLANK.test(char) && slugifyHandle(`ab${char}cd`) !== "ab-cd")),
  }).toEqual({ admittedByD257: [], admittedByAlphabet: [], invisibleNotDropped: [], blankNotSeparated: [] });
  expect(unseen.length).toBeGreaterThan(0);
});

test("a name made only of invisible code points takes the empty-slug path", () => {
  // Hangul filler (folds to the jungseong filler), zero-width space and joiner, an emoji variation selector.
  const names = [String.fromCodePoint(0x31_64), String.fromCodePoint(0x20_0b, 0x20_0d), String.fromCodePoint(0xfe_0f)];
  const fallback = slugifyHandle(String.fromCodePoint(0x1_f4_09)).replace(/-[^-]+$/u, "");
  expect(
    names.map((name) => {
      const handle = slugifyHandle(name);
      return { fallback: handle.startsWith(`${fallback}-`), valid: characterHandleSchema.safeParse(handle).success };
    }),
  ).toEqual(names.map(() => ({ fallback: true, valid: true })));
});

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
