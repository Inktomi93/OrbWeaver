import { initialsFor } from "@orb/kit/initials";
import { expect, test } from "../../support/fixtures";

test("initialsFor takes the first + last word initial", () => {
  expect(initialsFor("Nate Silver")).toBe("NS");
});

test("initialsFor uses first-and-LAST for 3+ word names (not first-two)", () => {
  expect(initialsFor("John Fitzgerald Kennedy")).toBe("JK");
});

test("initialsFor returns a single letter for a one-word name", () => {
  expect(initialsFor("Aria")).toBe("A");
});

test("initialsFor uppercases", () => {
  expect(initialsFor("aria")).toBe("A");
});

test("initialsFor falls back to '?' for empty / whitespace-only", () => {
  expect(initialsFor("")).toBe("?");
  expect(initialsFor("   ")).toBe("?");
});

test("initialsFor keeps a leading emoji as a whole grapheme (no split surrogate)", () => {
  const out = initialsFor("😀Bob");
  expect(out).toBe("😀");
  // The charAt(0) bug this module supersedes yielded a lone high surrogate here.
  expect(out.isWellFormed()).toBe(true);
});

test("initialsFor keeps an astral first letter intact", () => {
  const out = initialsFor("𝕏avier");
  expect(out).toBe("𝕏".toUpperCase());
  expect(out.isWellFormed()).toBe(true);
});

test("initialsFor combines first + last grapheme of an emoji-led two-word name", () => {
  const out = initialsFor("😀 Bob");
  expect(out).toBe("😀B");
  expect(out.isWellFormed()).toBe(true);
});

test("initialsFor handles CJK names (single word → one glyph)", () => {
  expect(initialsFor("李 明")).toBe("李明");
});
