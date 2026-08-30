// substrate/background — the ST backgrounds/ plane's file rules. Pins: an extension maps to its claimed
// mime (case-insensitively), an unlisted extension (or no extension) is null (reported unimported rather
// than guessed), and the display name strips the extension with a fallback for an empty stem.

import { describe } from "vitest";
import { stBackgroundMime, stBackgroundName } from "../../../../../packages/server/src/domain/import/substrate/background.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("stBackgroundMime", () => {
  test("a listed extension resolves case-insensitively", () => {
    expect(stBackgroundMime("bedroom.PNG")).toBe("image/png");
    expect(stBackgroundMime("clip.webm")).toBe("video/webm");
  });

  test("an unlisted extension is null — reported unimported, never guessed", () => {
    expect(stBackgroundMime("notes.txt")).toBeNull();
  });

  test("no extension (or a leading dot only) is null", () => {
    expect(stBackgroundMime("noext")).toBeNull();
    expect(stBackgroundMime(".hidden")).toBeNull();
  });
});

describe("stBackgroundName", () => {
  test("strips the extension, matching ST's own picker label", () => {
    expect(stBackgroundName("bedroom clean.jpg")).toBe("bedroom clean");
  });

  test("an empty stem after trimming falls back to the full filename", () => {
    expect(stBackgroundName(".png")).toBe(".png");
  });

  test("no extension returns the filename as-is", () => {
    expect(stBackgroundName("plainname")).toBe("plainname");
  });
});
