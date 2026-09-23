// The documents/ledger family. Two capabilities under test, and they are opposites:
//
//   the CORPUS tolerates a refused member and reports it as a ROW (losing a document silently is how a
//   citation policy reports a clean sweep over prose it never read);
//   the named LEDGER does NOT — an absent registry member refuses the whole fact, because "this D-id has no
//   row" computed against a registry that failed to load is not uncertain, it is INVERTED.
//
// Every arm carries its planted control in both directions.
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { DocumentIndex, LedgerFacts } from "../../../../tooling/src/verify/contract/resource-document.ts";
import { loadDocumentIndex, loadLedger, readMarkdownFacts } from "../../../../tooling/src/verify/ops/resource-document.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ADR_TREE = "docs/adr";

function documents(scratch: string, overlay: Readonly<Record<string, string | null>>): ResourceLoad<DocumentIndex> {
  return loadDocumentIndex(createResourceReader({ root: scratch, overlay }));
}

function ledger(scratch: string, overlay: Readonly<Record<string, string | null>>, id: Parameters<typeof loadLedger>[1]): ResourceLoad<LedgerFacts> {
  return loadLedger(createResourceReader({ root: scratch, overlay }), id);
}

test("a fenced heading and a fenced link are SAMPLE TEXT, not facts", () => {
  const source = ["# Real", "", "```md", "# Sample", "[sample](docs/never.md)", "```", "", "[real](docs/Mission.md)"].join("\n");
  const facts = readMarkdownFacts("docs/x.md", source);

  // Positive control: the two real members are seen, at their real lines.
  expect(facts.headings).toEqual([{ depth: 1, text: "Real", anchor: "real", line: 1 }]);
  expect(facts.links).toEqual([{ target: "docs/Mission.md", text: "real", form: "inline", line: 8 }]);
  // Negative control: the same two shapes INSIDE a fence are absent. Without this, every documentation
  // example of a broken cite becomes a dangling-reference finding against the doc that explains it.
  expect(facts.links.map((link) => link.target)).not.toContain("docs/never.md");
});

test("every readable corpus member is served, sorted by path, with no separate census to fail against", ({ scratch }) => {
  const index = documents(scratch, { "docs/Mission.md": "# Mission\n", "docs/rogue.md": "# Rogue\n" });
  if (index.status !== "ready") {
    throw new Error(`fixture corpus failed: ${index.reason}`);
  }

  expect(index.value.documents.map((document) => document.path)).toEqual(["docs/Mission.md", "docs/rogue.md"]);
  expect(index.value.refusals).toEqual([]);
  expect(index.members).toBe(2);
});

test("a TREE ledger serves exactly its grammar members: the index, a slugless name and a nested file are not decisions", ({ scratch }) => {
  const served = ledger(
    scratch,
    {
      [`${ADR_TREE}/0164-docs.md`]: "# Docs\n",
      [`${ADR_TREE}/0001-auth-seam.md`]: "# Auth seam\n",
      [`${ADR_TREE}/README.md`]: "| D1 | index |\n",
      [`${ADR_TREE}/0005.md`]: "# No slug\n",
      [`${ADR_TREE}/nested/0006-deep.md`]: "# Nested\n",
    },
    "d-ledger",
  );

  expect(served.status).toBe("ready");
  // Sorted, and only the two `NNNN-<slug>.md` files: the published paths are the members, so a
  // declaration's cross-root check sees no index or stray as belonging to the ledger.
  expect(served.status === "ready" ? served.value.documents.map((document) => document.path) : []).toEqual([
    `${ADR_TREE}/0001-auth-seam.md`,
    `${ADR_TREE}/0164-docs.md`,
  ]);
  expect(served.paths).toEqual([`${ADR_TREE}/0001-auth-seam.md`, `${ADR_TREE}/0164-docs.md`]);
});

test("an ABSENT ledger tree refuses; a tree with no member is an EMPTY population, not a refusal", ({ scratch }) => {
  // The planted control for the refusal: with no tree there is no ledger, and every "this id has no
  // decision" built on it would be inverted.
  const absent = ledger(scratch, { "docs/Mission.md": "# Mission\n" }, "d-ledger");
  expect(absent.status).not.toBe("ready");
  expect(absent.status === "ready" ? "" : absent.reason).toContain(ADR_TREE);

  // The §5 line in the other direction: a present tree holding only its index is a ready, zero-member
  // population; the declaration resolver, not this door, refuses it as empty.
  const indexOnly = ledger(scratch, { [`${ADR_TREE}/README.md`]: "# Decisions\n" }, "d-ledger");
  expect(indexOnly.status).toBe("ready");
  expect(indexOnly.members).toBe(0);
});
