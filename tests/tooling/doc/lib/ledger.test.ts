// The legacy registry reader: both row shapes parse to one ruling shape, a duplicate anchor is named, the
// reserved range comes from the registry's own note, and removing rulings leaves the rest byte-intact.
import { adrSlug, parseRegistry, renderAdr, reservedRange, withoutRulings } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const REGISTRY = [
  "---",
  "kind: reference",
  "status: active",
  "updated: 2026-09-20",
  "---",
  "",
  "# Registry",
  "",
  "> **RESERVED RANGE — D79–D105:** main-era rulings.",
  "",
  "## D1-D34",
  "",
  "- **D1** — The auth seam is `entry/auth/seam.ts`.",
  "",
  "- **D2** — Two lines:",
  "  - a continuation bullet",
  "",
  "## D62",
  "",
  "- **D62** — The UI revamp rulings:",
  "  - **P1** — touch floor.",
  "",
  "## D141 (2026-08-14 — SOURCE COMMENTS STATE PRESENT CONSTRAINTS)",
  "",
  "- **D141 — code comments carry only irreducible current WHY.** A stable anchor may accompany it.",
  "",
  "- **D142 — a heading-less follow-on row.** Owner-ruled.",
  "",
].join("\n");

test("bullet rows and heading sections parse to the same ruling shape, in file order", () => {
  const parsed = parseRegistry(REGISTRY);
  expect(parsed.rulings.map((ruling) => [ruling.id, ruling.shape, ruling.title])).toEqual([
    [1, "bullet", "D1"],
    [2, "bullet", "D2"],
    [62, "section", "D62"],
    [141, "section", "code comments carry only irreducible current WHY"],
  ]);
  expect(parsed.rulings[0]?.body).toBe("The auth seam is `entry/auth/seam.ts`.");
  expect(parsed.rulings[1]?.body).toBe("Two lines:\n  - a continuation bullet");
  expect(parsed.rulings[2]?.body).toBe("The UI revamp rulings:\n  - **P1** — touch floor.");
  expect(parsed.rulings[3]?.body).toContain("A stable anchor may accompany it.");
  expect(parsed.rulings[3]?.body).toContain("D142");
  expect(parsed.duplicates).toEqual([]);
  expect(parsed.reserved).toEqual({ lo: 79, hi: 105 });
});

test("a duplicate anchor is reported, and a registry with no note has no reserved range", () => {
  const twice = `${REGISTRY}\n## D1-D2\n\n- **D1** — again.\n`;
  expect(parseRegistry(twice).duplicates).toEqual([1]);
  expect(reservedRange("# bare\n")).toBeNull();
});

test("the ADR slug derives from the title and falls back to the id", () => {
  const parsed = parseRegistry(REGISTRY);
  expect(adrSlug(parsed.rulings[3] as NonNullable<(typeof parsed.rulings)[3]>)).toBe("code-comments-carry-only-irreducible-current-why");
  expect(adrSlug(parsed.rulings[0] as NonNullable<(typeof parsed.rulings)[0]>)).toBe("d1");
  expect(adrSlug({ id: 7, title: "###", body: "", shape: "bullet" })).toBe("ruling-7");
});

test("a rendered ADR carries the ruling under Decision and the four required sections", () => {
  const ruling = parseRegistry(REGISTRY).rulings[0] as NonNullable<ReturnType<typeof parseRegistry>["rulings"][0]>;
  const adr = renderAdr(ruling, "2026-09-23");
  expect(adr.startsWith("---\nkind: adr\nstatus: active\nupdated: 2026-09-23\n---\n")).toBe(true);
  expect(adr).toContain("## Decision\n\nThe auth seam is `entry/auth/seam.ts`.\n");
  expect(adr).toContain("## Alternatives rejected\n\nNot recorded in the ledger row.\n");
});

test("removing rulings drops whole rows or whole sections and leaves the rest byte-intact", () => {
  const rest = withoutRulings(REGISTRY, new Set([2, 62]));
  expect(rest).not.toContain("**D2**");
  expect(rest).not.toContain("a continuation bullet");
  expect(rest).not.toContain("touch floor");
  expect(rest).toContain("- **D1** — The auth seam is `entry/auth/seam.ts`.");
  expect(rest).toContain("## D141 (2026-08-14");
  expect(rest).toContain("**D142 —");
  expect(rest).not.toContain("\n\n\n");
  expect(withoutRulings(REGISTRY, new Set())).toBe(REGISTRY);
});
