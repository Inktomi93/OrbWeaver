import { slugifyHandle } from "@orb/kit/slug";
import { expect, test } from "../../support/fixtures";

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

test("slugifyHandle falls back to 'unnamed' when nothing slug-worthy remains", () => {
  expect(slugifyHandle("✨✨")).toBe("unnamed");
  expect(slugifyHandle("")).toBe("unnamed");
  // Pure punctuation and pure whitespace both fold to nothing slug-worthy.
  expect(slugifyHandle("!!!")).toBe("unnamed");
  expect(slugifyHandle("   ")).toBe("unnamed");
});
