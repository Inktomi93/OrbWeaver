// THE SCOPED WRITE DOOR and the BARRIER REFUSAL (#2165). `doc-catalog:write` regenerated every row from
// the working tree, and `attest`'s closing line told the operator to run it: after a ONE-FILE re-attest on
// main that produced 184 insertions across every document that had changed that day, exit 1 on unrelated
// pre-existing debt, AND a written file — so `$?` could not distinguish "refused" from "wrote something
// you did not mean", and the operator had to judge it by reading `git diff`. It is the same class as the
// standing rule "never run a whole-tree regenerator on a multi-lane tree".
//
// Both halves are pinned here, each with its control in BOTH directions, because a scoped door nobody is
// forced to use only moves the footgun:
//   · the scoped form touches ONE row and leaves every other byte of the catalog alone;
//   · the whole form REFUSES while the catalog's inputs are dirty, and PROCEEDS when they are clean or
//     when the caller says `--barrier`.

import type { Doc, Frontmatter, LaneConfig, Receipt, ReceiptEntry } from "../../../../tooling/src/doc-catalog/index.ts";
import { catalogInputDirt, scopedCatalog } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HASH_LENGTH = 64;
const COMMIT_LENGTH = 40;
const OLD_HASH = "a".repeat(HASH_LENGTH);
const NEW_HASH = "b".repeat(HASH_LENGTH);
const OTHER_HASH = "c".repeat(HASH_LENGTH);
const COMMIT = "1".repeat(COMMIT_LENGTH);
const MINE = "docs/architecture/core/Mine.md";
const THEIRS = "docs/design/theirs.md";

const CONFIG: LaneConfig = {
  schemaVersion: 1,
  lanes: [
    { id: "core", issue: 1, patterns: ["docs/architecture/core/**"] },
    { id: "design", issue: 2, patterns: ["docs/design/**"] },
  ],
};

const FRONTMATTER: Frontmatter = { present: true, malformed: false, fields: { kind: "law", status: "active", updated: "2026-09-12" }, errors: [] };

/** Lane ownership for the NAMED documents, which the DRIVER resolves and hands in. `laneAssignments`
 *  globs the real filesystem, so a synthetic corpus could never be assigned by it — passing it as data is
 *  what keeps `scopedCatalog` a pure function of its inputs and this suite free of a repository. */
const ASSIGNMENTS = new Map(
  [
    [MINE, CONFIG.lanes[0]],
    [THEIRS, CONFIG.lanes[1]],
  ].map(([path, lane]) => [path as string, lane as (typeof CONFIG.lanes)[number]] as const),
);

function doc(path: string, sha256: string): Doc {
  return { path, lines: 10, bytes: 100, sha256, frontmatter: FRONTMATTER };
}

function entry(path: string, sha256: string): ReceiptEntry {
  return {
    path,
    assignedSha256: sha256,
    disposition: "current",
    authority: "normative",
    fullRead: true,
    verifiedSha256: sha256,
    verifiedCommit: COMMIT,
    verifiedAt: "2026-09-12",
    evidence: ["read in full"],
    summary: "the row",
  };
}

function receipt(lane: string, issue: number, entries: readonly ReceiptEntry[]): Receipt {
  return { schemaVersion: 1, lane, issue, entries };
}

/** A committed catalog carrying both documents at their OLD bytes — the base every scoped write starts from. */
function committedBase(): string {
  return JSON.stringify({
    schemaVersion: 1,
    stats: { pending: 0, missingFrontmatter: 0, invalidFrontmatter: 0, malformedFrontmatter: 0 },
    documents: [
      {
        path: MINE,
        lane: "core",
        issue: 1,
        lines: 10,
        bytes: 100,
        sha256: OLD_HASH,
        frontmatter: FRONTMATTER,
        receipt: entry(MINE, OLD_HASH),
        receiptCurrent: true,
      },
      {
        path: THEIRS,
        lane: "design",
        issue: 2,
        lines: 10,
        bytes: 100,
        sha256: OTHER_HASH,
        frontmatter: FRONTMATTER,
        receipt: entry(THEIRS, OTHER_HASH),
        receiptCurrent: true,
      },
    ],
  });
}

function rowsOf(contents: string): readonly { readonly path: string; readonly sha256: string }[] {
  return (JSON.parse(contents) as { readonly documents: readonly { readonly path: string; readonly sha256: string }[] }).documents;
}

test("a scoped write regenerates ONLY the named row, even while a sibling's document has moved underneath it", () => {
  // The tree has moved for BOTH documents — mine because I edited it, theirs because a sibling lane did.
  // The whole form would sweep both; this one must not see theirs at all.
  const scoped = scopedCatalog({
    base: committedBase(),
    named: [MINE],
    docs: [doc(MINE, NEW_HASH), doc(THEIRS, NEW_HASH)],
    receipts: [receipt("core", 1, [entry(MINE, NEW_HASH)]), receipt("design", 2, [entry(THEIRS, NEW_HASH)])],
    config: CONFIG,
    assignments: ASSIGNMENTS,
  });
  expect(scoped.refusals).toEqual([]);
  const rows = rowsOf(scoped.contents as string);
  expect(rows.map(({ path, sha256 }) => [path, sha256])).toEqual([
    [MINE, NEW_HASH],
    // THE WHOLE POINT: the sibling's row keeps the bytes it was COMMITTED with, not the bytes on the tree.
    [THEIRS, OTHER_HASH],
  ]);
});

test("the scoped write REFUSES rather than writing a catalog it cannot base on truth", () => {
  const args = {
    named: [MINE],
    docs: [doc(MINE, NEW_HASH)],
    receipts: [receipt("core", 1, [entry(MINE, NEW_HASH)])],
    config: CONFIG,
    assignments: ASSIGNMENTS,
  };

  const absent = scopedCatalog({ ...args, base: null });
  expect(absent.contents).toBeUndefined();
  expect(absent.refusals[0]).toContain("no committed base to scope against");

  const unparseable = scopedCatalog({ ...args, base: "{not json" });
  expect(unparseable.contents).toBeUndefined();
  expect(unparseable.refusals[0]).toContain("not the shape this tool writes");

  // A shape that PARSES but is not a catalog is the same refusal — "it was JSON" is not "it was a base".
  const wrongShape = scopedCatalog({ ...args, base: JSON.stringify({ schemaVersion: 1 }) });
  expect(wrongShape.contents).toBeUndefined();
  expect(wrongShape.refusals[0]).toContain("not the shape this tool writes");

  const unknown = scopedCatalog({ ...args, base: committedBase(), named: ["docs/design/never-existed.md"] });
  expect(unknown.contents).toBeUndefined();
  expect(unknown.refusals[0]).toContain("not a catalogued document");

  // …and the other direction: the SAME base and the SAME named row write, so the refusals above are the
  // guard working rather than the function being inert.
  expect(scopedCatalog({ ...args, base: committedBase() }).contents).toBeDefined();
});

// MEASURED ON THE REAL TREE and fixed here: the first cut re-sorted the union with `localeCompare`, and a
// ONE-DOCUMENT write came back with a 4141-line diff — the committed order is the tracked-file order
// (`docs/Mission.md` before `docs/architecture/…`, capital M first) and a locale sort is case-insensitive,
// so every row moved. A scoped write whose diff is the whole file is not a scoped write, and the end-to-end
// number is the proof it is fixed: 20 lines, one row, after attest + `--paths`.
test("the base's ROW ORDER survives, even when it is not the order a fresh sort would produce", () => {
  const unsorted = JSON.parse(committedBase()) as { documents: unknown[] };
  const reversed = JSON.stringify({ ...unsorted, documents: [...unsorted.documents].reverse() });
  const scoped = scopedCatalog({
    base: reversed,
    named: [MINE],
    docs: [doc(MINE, NEW_HASH), doc(THEIRS, OTHER_HASH)],
    receipts: [receipt("core", 1, [entry(MINE, NEW_HASH)])],
    config: CONFIG,
    assignments: ASSIGNMENTS,
  });
  expect(scoped.refusals).toEqual([]);
  // THEIRS first, because that is the order the base carried — not the order a sort would pick.
  expect(rowsOf(scoped.contents as string).map(({ path }) => path)).toEqual([THEIRS, MINE]);
});

test("a named document that has LEFT the tree drops its row instead of preserving a lie", () => {
  const scoped = scopedCatalog({
    base: committedBase(),
    named: [MINE],
    docs: [doc(THEIRS, OTHER_HASH)],
    receipts: [receipt("design", 2, [entry(THEIRS, OTHER_HASH)])],
    config: CONFIG,
    assignments: ASSIGNMENTS,
  });
  expect(scoped.refusals).toEqual([]);
  expect(rowsOf(scoped.contents as string).map(({ path }) => path)).toEqual([THEIRS]);
});

// THE BARRIER HALF. `catalogInputDirt` is what the whole form consults before it regenerates anything.
test("the whole-tree write's guard names the dirty inputs, ignores everything else, and treats a missing census as DIRT", () => {
  const dirty = catalogInputDirt(new Set(["docs/design/theirs.md"]), new Set(["docs/catalog/receipts/core.json", "packages/ui/src/x.ts"]));
  // Only the catalog's OWN inputs count — a sibling's source edit is not this artifact's business.
  expect(dirty).toEqual(["docs/catalog/receipts/core.json", "docs/design/theirs.md"]);

  // The clean direction: a tree whose uncommitted movement is all outside the closure does not refuse.
  expect(catalogInputDirt(new Set(["packages/ui/src/x.ts"]), new Set(["tooling/src/verify/cli.ts"]))).toEqual([]);
  expect(catalogInputDirt(new Set(), new Set())).toEqual([]);

  // A census Git could not produce is "I could not ask", never "nothing is there" — it refuses, and says so.
  expect(catalogInputDirt(null, new Set())[0]).toContain("Git census is unavailable");
  expect(catalogInputDirt(new Set(), null)[0]).toContain("Git census is unavailable");
});
