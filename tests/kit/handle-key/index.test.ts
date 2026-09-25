import process from "node:process";
import { admitsHandle, handleKey } from "@orb/kit/handle-key";
import { describe } from "vitest";
import { UNICODE_DATA_VERSION } from "../../../packages/kit/src/handle-key/unicode-data.ts";
import { expect, test } from "../../support/fixtures.ts";

const BMP_FIRST_PRINTABLE = 0x20;
const BMP_LAST = 0xff_ff;
const SURROGATES = [0xd8_00, 0xdf_ff] as const;

// Invisible and direction-changing characters are built from code points, so none of them sits raw in this file.
const CHAR = {
  rlo: String.fromCodePoint(0x20_2e),
  rli: String.fromCodePoint(0x20_67),
  pdi: String.fromCodePoint(0x20_69),
  bel: String.fromCodePoint(0x07),
  lf: String.fromCodePoint(0x0a),
  lineSeparator: String.fromCodePoint(0x20_28),
  paragraphSeparator: String.fromCodePoint(0x20_29),
  zwj: String.fromCodePoint(0x20_0d),
  ideographicSpace: String.fromCodePoint(0x30_00),
  noBreakSpace: String.fromCodePoint(0xa0),
  interlinearAnchor: String.fromCodePoint(0xff_f9),
  arabicEndOfAyah: String.fromCodePoint(0x06_dd),
  brailleBlank: String.fromCodePoint(0x28_00),
  nullNotehead: String.fromCodePoint(0x1_d1_59),
} as const;

// Every space separator but U+0020 displays as a blank a reader cannot tell from a plain space or from nothing.
const NON_ASCII_SPACES = [0xa0, 0x16_80, ...Array.from({ length: 11 }, (_, i) => 0x20_00 + i), 0x20_2f, 0x20_5f, 0x30_00].map((cp) => String.fromCodePoint(cp));

describe("handleKey", () => {
  test.each([
    ["an accented case variant", "Émile", "émile"],
    ["a Cyrillic capital look-alike", "Нost", "host"],
    ["a Cyrillic small look-alike", "нost", "host"],
    ["a full-width compatibility form", "ｈｏｓｔ", "host"],
    ["a digit look-alike", "h0st", "host"],
    ["a capital I standing for l", "paypaI", "paypal"],
    ["a lowercase-only look-alike", "ɑdmin", "admin"],
    ["a zero-width space inside", "ho​st", "host"],
    ["a whole-script Cyrillic spoof", "ѕсоре", "scope"],
  ])("%s shares the key: %s ≅ %s", (_, spoof, held) => {
    expect(handleKey(spoof)).toBe(handleKey(held));
  });

  test.each([
    ["host", "hosts"],
    ["rival", "rivalry"],
    ["Émile", "Emile"],
    ["alice", "bob"],
  ])("control: %s and %s stay distinct", (a, b) => {
    expect(handleKey(a)).not.toBe(handleKey(b));
  });

  test("a two-step prototype shares the key: admɪn ≅ admin", () => {
    expect(handleKey("admɪn")).toBe(handleKey("admin"));
  });

  test("the key is idempotent over the BMP", () => {
    const moving: string[] = [];
    for (let cp = BMP_FIRST_PRINTABLE; cp <= BMP_LAST; cp++) {
      if (cp >= SURROGATES[0] && cp <= SURROGATES[1]) {
        continue;
      }
      const key = handleKey(String.fromCodePoint(cp));
      if (handleKey(key) !== key) {
        moving.push(cp.toString(16));
      }
    }
    expect(moving).toEqual([]);
  });

  test("every BMP code point keys the same as its upper- and lower-cased forms", () => {
    const mismatches: string[] = [];
    for (let cp = BMP_FIRST_PRINTABLE; cp <= BMP_LAST; cp++) {
      if (cp >= SURROGATES[0] && cp <= SURROGATES[1]) {
        continue;
      }
      const char = String.fromCodePoint(cp);
      const key = handleKey(char);
      if (handleKey(char.toUpperCase()) !== key || handleKey(char.toLowerCase()) !== key) {
        mismatches.push(cp.toString(16));
      }
    }
    expect(mismatches).toEqual([]);
  });

  test.each([
    ["Greek inside Latin", "hσst"],
    ["Cyrillic inside Latin", "гoot"],
    ["Latin with Hangul and Hiragana", "a한や"],
    ["an unassigned code point", "ab͸"],
    ["65 code points", `a${"́".repeat(64)}`],
    ["only zero-width characters", "​‍"],
    ["only an ideographic space", "　"],
    ["a right-to-left override that displays `nimda` as `admin`", `${CHAR.rlo}nimda`],
    ["a right-to-left isolate pair", `${CHAR.rli}admin${CHAR.pdi}`],
    ["a bell control", `admin${CHAR.bel}`],
    ["a line feed", `ad${CHAR.lf}min`],
    ["a line separator", `ad${CHAR.lineSeparator}min`],
    ["a paragraph separator", `ad${CHAR.paragraphSeparator}min`],
    ["a zero-width joiner inside Latin", `ad${CHAR.zwj}min`],
    ["a trailing space", "admin "],
    ["a leading space", " admin"],
    ["a trailing ideographic space", `admin${CHAR.ideographicSpace}`],
    ["an inner no-break space", `ad${CHAR.noBreakSpace}min`],
    ["an interlinear annotation anchor (format, not default-ignorable)", `ad${CHAR.interlinearAnchor}min`],
    ["an end-of-ayah sign inside an Arabic handle (format, not default-ignorable)", `مد${CHAR.arabicEndOfAyah}ير`],
    ["only a Braille blank", CHAR.brailleBlank],
    ["only spaces", "   "],
    ["a trailing null notehead", `admin${CHAR.nullNotehead}`],
    ["an inner null notehead", `ad${CHAR.nullNotehead}min`],
    ["only a null notehead", CHAR.nullNotehead],
    ["an inner Braille blank", `ad${CHAR.brailleBlank}min`],
    ["a Braille blank between Braille letters", `⠁${CHAR.brailleBlank}⠃`],
    ["two inner spaces", "ad  min"],
  ])("admitsHandle refuses %s: %s", (_, handle) => {
    expect(admitsHandle(handle)).toBe(false);
  });

  test.each([
    ["accented Latin", "Émile"],
    ["all Cyrillic", "Дмитрий"],
    ["Hiragana with Han", "やまだ太郎"],
    ["Latin with Han and Katakana", "yamada太タ"],
    ["Latin with Hangul and Han", "kim한韓"],
    ["Latin with digits and punctuation", "user_01.dev"],
    ["an emoji", "😀"],
    ["Latin with an emoji", "cat😀"],
    ["one inner space", "ad min"],
    ["Braille letters", "⠁⠃"],
    ["an Arabic handle", "مدير"],
  ])("control: admitsHandle allows %s: %s", (_, handle) => {
    expect(admitsHandle(handle)).toBe(true);
  });

  test("every space separator but U+0020 is refused inside a handle", () => {
    expect(NON_ASCII_SPACES.filter((space) => admitsHandle(`ad${space}min`)).map((space) => space.codePointAt(0)?.toString(16))).toEqual([]);
  });

  // Stored keys mix the vendored tables with the engine's NFKC/NFD and case mapping, so an engine on another
  // Unicode version computes keys that no longer match the stored ones until the data is regenerated.
  test("the vendored tables are the engine's Unicode version", () => {
    expect(UNICODE_DATA_VERSION.startsWith(`${process.versions["unicode"] ?? "unknown"}.`)).toBe(true);
  });
});
