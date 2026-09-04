import { slugifyHandle } from "@orb/kit/slug";
import { expect, test } from "../../support/fixtures.ts";

test("slugifyHandle lowercases and hyphenates word runs", () => {
  expect(slugifyHandle("Block of Cheese")).toBe("block-of-cheese");
});

test("slugifyHandle collapses case-variant names onto one handle", () => {
  expect(slugifyHandle("Block Of Cheese")).toBe(slugifyHandle("block of cheese"));
});

test("slugifyHandle collapses runs of punctuation/space and trims edges", () => {
  expect(slugifyHandle("  Hello!!  World  ")).toBe("hello-world");
});

test("slugifyHandle NFKD-folds accents so the combining mark drops out", () => {
  expect(slugifyHandle("Café")).toBe("cafe");
});

test("an EMPTY name is the one bare 'unnamed' — `entry/http/import-chat` routes on that exact value", () => {
  expect(slugifyHandle("")).toBe("unnamed");
});

test("a name with no letters or digits still gets a DISTINCT handle per name", () => {
  // The old fold sent every one of these to the bare "unnamed", so the SECOND such character an owner created
  // or imported hit `characters_owner_handle_unique` and the create was refused.
  const emoji = slugifyHandle("✨✨");
  const otherEmoji = slugifyHandle("🎲");
  const punctuation = slugifyHandle("!!!");
  expect(emoji.startsWith("unnamed-")).toBe(true);
  expect(new Set([emoji, otherEmoji, punctuation]).size).toBe(3);
  // Stable: the same name always answers the same handle (import pairing keys on this).
  expect(slugifyHandle("✨✨")).toBe(emoji);
});

test("non-Latin names keep their letters — CJK, Cyrillic, Arabic, Hangul, Greek", () => {
  expect(slugifyHandle("あたる")).toBe("あたる");
  expect(slugifyHandle("东西")).toBe("东西");
  expect(slugifyHandle("Маша")).toBe("маша");
  expect(slugifyHandle("مرحبا")).toBe("مرحبا");
  // Greek lowercases but KEEPS its accent: the "Café" → "cafe" fold drops a combining mark only when it
  // sits on an ASCII base, because outside Latin the marks carry the vowels (Devanagari below).
  expect(slugifyHandle("Ωμέγα")).toBe("ωμέγα".normalize("NFKD"));
  // Two Hindi names that differ ONLY by their vowel signs stay two handles.
  expect(slugifyHandle("किताब")).not.toBe(slugifyHandle("कताब"));
  const distinct = new Set(["あたる", "东西", "Маша", "مرحبا", "안녕"].map(slugifyHandle));
  expect(distinct.size).toBe(5);
});

test("the folded part is capped, and a truncated fold carries a disambiguator", () => {
  // NFKD can EXPAND a name several times over, so an in-bounds name could otherwise fold past the 200-char
  // wire cap on `handle` and be refused at the create boundary. Two long names sharing a prefix stay distinct.
  const long = "a".repeat(300);
  expect(slugifyHandle(long).length).toBeLessThan(200);
  expect(slugifyHandle(`${long}one`)).not.toBe(slugifyHandle(`${long}two`));
});

test("#1525 the length cut lands on a CODE POINT, so a non-BMP name never yields half a surrogate pair", () => {
  // The cut used to slice UTF-16 UNITS. Non-BMP letters survive the Unicode fold, so a long name written in
  // (say) Cuneiform came back with a severed pair — `isWellFormed()` false, i.e. a handle that breaks every
  // byte-oriented consumer downstream and cannot even be encoded to UTF-8 without a replacement char.
  const cuneiform = `a${"\u{13000}".repeat(60)}`; // 61 code points, 121 UTF-16 units
  expect(slugifyHandle(cuneiform).isWellFormed()).toBe(true);
  // …and the same at a length that genuinely truncates: still well-formed, still disambiguated, still in cap.
  const overLong = "\u{13000}".repeat(100);
  const handle = slugifyHandle(overLong);
  expect(handle.isWellFormed()).toBe(true);
  expect(handle.length).toBeLessThan(200);
  expect(handle).toMatch(/-[0-9a-z]+$/u);
  expect(slugifyHandle(`${overLong}\u{13001}`)).not.toBe(handle);
  // A lone surrogate in the INPUT is not a letter, digit or mark, so it never reaches the output either.
  expect(slugifyHandle("a\ud800b").isWellFormed()).toBe(true);
});

test("a handle never carries a path, quote or reserved-namespace character", () => {
  // The output alphabet is `\p{L}\p{N}\p{M}` + `-`, which is what makes the handle safe as a descriptor path
  // segment (`entry/http/import-chat`) and unable to claim the `__group__*` synthetic namespace. The bidi
  // override in the list is the classic filename-spoof character — it is a format char, not a letter.
  for (const hostile of ["../../etc/passwd", 'a" onload=x', "__group__chat_1", "a/b\\c", "‮gnp.exe", "a b"]) {
    expect(slugifyHandle(hostile)).toMatch(/^[\p{L}\p{N}\p{M}-]+$/u);
  }
  expect(slugifyHandle("__group__chat_1").startsWith("__group__")).toBe(false);
});
