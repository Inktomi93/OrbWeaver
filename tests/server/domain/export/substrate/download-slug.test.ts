// Unit: the download-filename slug policy (export.md §8-slot substrate). Asserts the filename-safe
// transform: keep `.`/`_`/`-`, collapse unsafe runs to `_`, trim edge underscores, cap at 60, fall back to
// "export" when the name slugs to empty.

import { describe, expect, test } from "vitest";
import { slug } from "../../../../../packages/server/src/domain/export/substrate/download-slug.ts";

describe("slug", () => {
  test("keeps safe chars and collapses unsafe runs to a single underscore", () => {
    expect(slug("Aria the Brave!!!")).toBe("Aria_the_Brave");
    expect(slug("my-card_v1.2")).toBe("my-card_v1.2");
  });

  test("trims leading/trailing underscores (no `_Aria_` from `:Aria:`)", () => {
    expect(slug(" :Aria: ")).toBe("Aria");
  });

  test("falls back to `export` when the name slugs to empty", () => {
    expect(slug("")).toBe("export");
    expect(slug("@@@")).toBe("export");
    expect(slug("   ")).toBe("export");
  });

  test("caps at 60 characters", () => {
    expect(slug("a".repeat(100))).toHaveLength(60);
  });
});
