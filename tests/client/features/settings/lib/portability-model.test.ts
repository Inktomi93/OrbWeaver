// Unit: the Backup & Restore pane's pure export/import model (features/settings/lib/portability-model).
// Pins the load-bearing derivations: the export-kind set EXCLUDES `assets` (media always rides along), the
// href builder omits `kinds` for a full pick but appends `assets` to a partial one, the label Record is
// exhaustive over the offered kinds, and the summary normalizers (`unknown` workload result → counts;
// card batch → per-file; caption elision of zero tallies).

import type { PortableKind } from "@orb/contracts/portability";
// Deep import the PURE module (NOT the "@orb/client/..." barrel): a barrel import drags browser TSX into
// the dom-less node typecheck:graph program (the 2026-06-28 dom-lib incident).
import {
  asBundleCounts,
  buildLibraryExportHref,
  EXPORTABLE_KINDS,
  PORTABLE_KIND_LABELS,
  summarizeBundleCounts,
  summarizeCardImport,
  summaryCaption,
} from "../../../../../packages/client/src/features/settings/lib/portability-model";
import { expect, test } from "../../../../support/fixtures";

test("EXPORTABLE_KINDS excludes `assets` and every offered kind has a label", () => {
  expect(EXPORTABLE_KINDS).not.toContain("assets");
  expect(EXPORTABLE_KINDS).toContain("character");
  expect(EXPORTABLE_KINDS).toContain("user-settings");
  for (const kind of EXPORTABLE_KINDS) {
    expect(PORTABLE_KIND_LABELS[kind]).toBeTruthy();
  }
});

test("a FULL selection omits the kinds param (server exports everything, media included)", () => {
  const all = new Set(EXPORTABLE_KINDS);
  expect(buildLibraryExportHref(all)).toBe("/api/export/library");
});

test("a PARTIAL selection lists the picked kinds AND appends assets so blobs always travel", () => {
  const href = buildLibraryExportHref(new Set<PortableKind>(["character"]));
  expect(href).toBe("/api/export/library?kinds=character,assets");
});

test("an EMPTY selection still forces assets (the surface disables the button in this state)", () => {
  expect(buildLibraryExportHref(new Set<PortableKind>())).toBe("/api/export/library?kinds=assets");
});

test("asBundleCounts narrows the `unknown` workload result, defaulting missing/garbage fields to 0", () => {
  expect(asBundleCounts({ imported: 3, skipped: 1, failed: 2 })).toEqual({
    imported: 3,
    skipped: 1,
    failed: 2,
  });
  expect(asBundleCounts({ imported: 5 })).toEqual({ imported: 5, skipped: 0, failed: 0 });
  expect(asBundleCounts(null)).toEqual({ imported: 0, skipped: 0, failed: 0 });
  expect(asBundleCounts("boom")).toEqual({ imported: 0, skipped: 0, failed: 0 });
});

test("summarizeBundleCounts carries the counts with an empty per-file list", () => {
  const summary = summarizeBundleCounts({ imported: 4, skipped: 0, failed: 1 });
  expect(summary).toEqual({ imported: 4, skipped: 0, failed: 1, outcomes: [] });
});

test("summarizeCardImport maps the server's REAL result — created→imported, deduped→skipped", () => {
  const summary = summarizeCardImport({
    imported: [
      { filename: "elara.png", created: true },
      { filename: "kai.json", created: false },
    ],
    failed: [],
  });
  expect(summary).toEqual({
    imported: 1,
    skipped: 1,
    failed: 0,
    outcomes: [
      { path: "elara.png", ok: true, detail: "Character card" },
      { path: "kai.json", ok: true, detail: "Already imported" },
    ],
  });
});

test("summarizeCardImport surfaces a server `failed` entry as a FAILURE with its reason (no fake ✓)", () => {
  const summary = summarizeCardImport({
    imported: [],
    failed: [{ filename: "garbage.json", error: "not a valid character card" }],
  });
  expect(summary.imported).toBe(0);
  expect(summary.failed).toBe(1);
  const [outcome] = summary.outcomes;
  expect(outcome).toEqual({
    path: "garbage.json",
    ok: false,
    detail: "not a valid character card",
  });
});

test("summaryCaption shows only the non-zero tallies", () => {
  expect(summaryCaption({ imported: 3, skipped: 0, failed: 0, outcomes: [] })).toBe("3 imported");
  expect(summaryCaption({ imported: 3, skipped: 1, failed: 2, outcomes: [] })).toBe(
    "3 imported · 1 skipped · 2 failed",
  );
});
