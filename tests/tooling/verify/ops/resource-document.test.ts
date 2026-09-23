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

const CATALOG = "docs/catalog/catalog.json";
const ADR_TREE = "docs/adr";
const ACTIVE_DEBT = "docs/law/Core-Audits-and-Debt.md";
const CLEARED_DEBT = "docs/law/Core-Debt-Cleared-Ledger.md";
function catalog(paths: readonly string[]): string {
  return JSON.stringify({ documents: paths.map((path) => ({ path })) });
}

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

test("catalog membership is a STATUS on every document, and an unlisted doc is not a refusal", ({ scratch }) => {
  const index = documents(scratch, {
    "docs/Mission.md": "# Mission\n",
    "docs/rogue.md": "# Rogue\n",
    [CATALOG]: catalog(["docs/Mission.md"]),
  });
  if (index.status !== "ready") {
    throw new Error(`fixture corpus failed: ${index.reason}`);
  }

  expect(index.value.documents.map((document) => [document.path, document.catalog])).toEqual([
    ["docs/Mission.md", "listed"],
    ["docs/rogue.md", "unlisted"],
  ]);
  // The door reports the liveness FACT; whether an unlisted document is a defect is the catalog policy's
  // ruling, and turning it into a host refusal would withhold the very policy whose job is to report it.
  expect(index.value.catalogMisses).toEqual([]);
  expect(index.value.refusals).toEqual([]);
  expect(index.members).toBe(2);
});

test("a catalog row naming an absent document is a MISS row, and a broken catalog refuses everything", ({ scratch }) => {
  const missed = documents(scratch, { "docs/Mission.md": "# Mission\n", [CATALOG]: catalog(["docs/Mission.md", "docs/vanished.md"]) });
  expect(missed.status === "ready" ? missed.value.catalogMisses : []).toEqual(["docs/vanished.md"]);

  // The control in the other direction: without a catalog there IS no `unlisted`, so every document's
  // status would be a lie. The whole fact refuses rather than defaulting.
  const noCatalog = documents(scratch, { "docs/Mission.md": "# Mission\n" });
  expect(noCatalog.status).toBe("missing");
  const broken = documents(scratch, { "docs/Mission.md": "# Mission\n", [CATALOG]: "{oops" });
  expect(broken.status).toBe("unresolved");
  const shapeless = documents(scratch, { "docs/Mission.md": "# Mission\n", [CATALOG]: "{}" });
  expect(shapeless.status).toBe("malformed");
});

test("the two halves of the PD registry are ONE identity — half of it refuses", ({ scratch }) => {
  const whole = ledger(scratch, { [ACTIVE_DEBT]: "| PD-1 | a |\n", [CLEARED_DEBT]: "| PD-2 | b |\n" }, "core-audits-debt");
  expect(whole.status).toBe("ready");
  expect(whole.status === "ready" ? whole.value.documents.map((document) => document.path) : []).toEqual([ACTIVE_DEBT, CLEARED_DEBT]);

  // The planted control: drop the CLEARED half and the fact refuses. A door that served the active half
  // alone would make every cleared PD id read as an orphan cite — a mass red with no defect behind it.
  const half = ledger(scratch, { [ACTIVE_DEBT]: "| PD-1 | a |\n" }, "core-audits-debt");
  expect(half.status).toBe("missing");
  expect(half.status === "ready" ? "" : half.reason).toContain(CLEARED_DEBT);
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
