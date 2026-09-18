// The reader's RESOLUTION rule (#1184) — pure, so the ambiguity edges are posed directly instead of planted.
// The cli.int suite proves the same behaviour through the real binary; this one exists because the edge that
// matters (an id that is also a PREFIX of a longer id) is awkward to plant and trivial to state.

import { describe } from "vitest";
import type { BugReportListing, BugReportSummary } from "../../../../tooling/src/bug-reports/contract/index.ts";
import { formatShow, resolveBugReport } from "../../../../tooling/src/bug-reports/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function summary(id: string, overrides: Partial<BugReportSummary> = {}): BugReportSummary {
  return {
    id,
    stem: `2026-09-02T10-00-00-${id}`,
    capturedAt: "2026-09-02T10:00:00.000Z",
    ageMs: 0,
    noteFirstLine: `note for ${id}`,
    route: "/",
    version: "v1.2.3 (abcdef123456, checkout)",
    sha: "abcdef1234567890abcdef1234567890abcdef12",
    dirty: false,
    truncatedSources: [],
    jsonPath: `/repo/bug-reports/2026-09-02T10-00-00-${id}.json`,
    markdownPath: `/repo/bug-reports/2026-09-02T10-00-00-${id}.md`,
    ...overrides,
  };
}

function listing(...reports: readonly BugReportSummary[]): BugReportListing {
  return { dir: "/repo/bug-reports", missing: false, reports, unreadable: [] };
}

describe("resolveBugReport", () => {
  test("an EXACT id wins even when it is also the prefix of a longer id", () => {
    // Without the exact-first rule a full, correct id would be REFUSED as ambiguous — the shorter id would
    // become permanently unreadable the moment a longer one happened to extend it.
    const resolution = resolveBugReport(listing(summary("abcd"), summary("abcd1234")), "abcd", null);
    expect(resolution.ok).toBe(true);
    expect(resolution.ok ? resolution.report.id : "").toBe("abcd");
  });

  test("a unique prefix resolves to the one match", () => {
    const resolution = resolveBugReport(listing(summary("abcd1234"), summary("wxyz9999")), "abcd", null);
    expect(resolution.ok ? resolution.report.id : "").toBe("abcd1234");
  });

  test("an AMBIGUOUS prefix refuses and returns EVERY candidate — never a pick", () => {
    const resolution = resolveBugReport(listing(summary("abcd1111"), summary("abcd2222")), "abcd", null);
    expect(resolution.ok).toBe(false);
    expect(resolution.ok ? [] : resolution.candidates).toEqual(["abcd1111", "abcd2222"]);
    expect(resolution.ok ? "" : resolution.reason).toContain("ambiguous");
  });

  test("no match refuses by naming the directory and the list command", () => {
    const resolution = resolveBugReport(listing(summary("abcd1111")), "zzzz", null);
    expect(resolution.ok).toBe(false);
    expect(resolution.ok ? "" : resolution.reason).toContain("/repo/bug-reports");
    expect(resolution.ok ? "" : resolution.reason).toContain("pnpm bug:reports");
  });
});

describe("formatShow", () => {
  test("names the JSON bundle even when the digest is present — the md is the index card, the json is the evidence", () => {
    const out = formatShow({ ok: true, report: summary("abcd1111"), markdown: "# Bug report abcd1111\n\nthe note\n" });
    expect(out).toContain("the note");
    expect(out).toContain("/repo/bug-reports/2026-09-02T10-00-00-abcd1111.json");
  });

  test("a MISSING digest degrades to the bundle path instead of failing the lookup", () => {
    const out = formatShow({ ok: true, report: summary("abcd1111", { markdownPath: null }), markdown: null });
    expect(out).toContain("no .md companion");
    expect(out).toContain("/repo/bug-reports/2026-09-02T10-00-00-abcd1111.json");
    expect(out).toContain("digest: (none)");
  });

  test("a report with truncated sources SAYS SO on the show output, not only in the listing", () => {
    const out = formatShow({ ok: true, report: summary("abcd1111", { truncatedSources: ["motion().shifts", "wire/captures"] }), markdown: "x" });
    expect(out).toContain("TRUNCATED sources");
    expect(out).toContain("motion().shifts");
    expect(out).toContain("wire/captures");
  });
});
