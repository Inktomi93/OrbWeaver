// Every bare `D<n>` that product code, standing law and decisions cite names a decision file or the reserved window.
// An id comes from a decision file NAME, never from prose, so a decision that mentions a number cannot mint it.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { describe } from "vitest";
import { DOC_TOOL_TREES, FIRST_RESERVED_RULING, LAST_RESERVED_RULING } from "../../../tooling/src/doc/contract/vocab.ts";
import { LEDGER_DEFINITIONS } from "../../../tooling/src/verify/contract/resource-document.ts";
import { populationIncludes } from "../../../tooling/src/verify/lib/population-resolver.ts";
import { scanText } from "./_text-scan.ts";
import type { RepoTree } from "./_tree.ts";
import { isMarkdown, isTypeScript, loadPlantedTree, loadTree, underAny } from "./_tree.ts";

const LEDGER = LEDGER_DEFINITIONS["d-ledger"];
const LEDGER_DIR = `${LEDGER.tree}/`;
const CITER_DOC_TREES = [DOC_TOOL_TREES.law, DOC_TOOL_TREES.adr];
const ID_PREFIX_RE = /^(\d+)-/u;
// The left boundary keeps `PD-<n>` and `<word>D<n>` out; the trailing `(?!\+)` keeps a range announcement ("D165+") out.
const CITE_RE = /(?<![A-Za-z0-9-])(D\d+)\b(?!\+)/gu;

interface DecisionCitations {
  readonly findings: readonly string[];
  readonly ledgerIds: ReadonlySet<string>;
  readonly productFiles: number;
  readonly citerDocs: number;
}

function ledgerIds(tree: RepoTree): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const path of tree.paths) {
    const name = path.slice(LEDGER_DIR.length);
    if (!path.startsWith(LEDGER_DIR) || name.includes("/") || !LEDGER.member.test(name)) {
      continue;
    }
    if (tree.read(path) === "") {
      throw new Error(`decision file ${path} is empty`);
    }
    ids.add(`D${String(Number(ID_PREFIX_RE.exec(name)?.[1]))}`);
  }
  if (ids.size === 0) {
    throw new Error(`${LEDGER_DIR} holds no decision file`);
  }
  return ids;
}

function resolves(token: string, ids: ReadonlySet<string>): boolean {
  const number = Number(token.slice(1));
  return ids.has(token) || (number >= FIRST_RESERVED_RULING && number <= LAST_RESERVED_RULING);
}

function decisionCitations(tree: RepoTree): DecisionCitations {
  const ids = ledgerIds(tree);
  const product = tree.paths.filter((path) => isTypeScript(path) && populationIncludes("@product", path));
  const docs = tree.paths.filter((path) => isMarkdown(path) && underAny(path, CITER_DOC_TREES));
  const findings = [...product, ...docs].flatMap((path) =>
    scanText(tree.read(path), CITE_RE)
      .filter((hit) => !resolves(hit.token, ids))
      .map((hit) => `${path}:${String(hit.line)}:${String(hit.column)} ${hit.token}`),
  );
  return { findings: findings.toSorted((left, right) => left.localeCompare(right)), ledgerIds: ids, productFiles: product.length, citerDocs: docs.length };
}

const DECISION = { "docs/adr/0001-an-entry.md": "# An entry\n" } as const;

describe("the real tree", () => {
  test("every D<n> citation resolves to a decision file or the reserved window", ({ repoRoot }) => {
    const result = decisionCitations(loadTree(repoRoot));
    // A walk that read nothing would pass: the denominators must be live.
    expect(result.ledgerIds.size).toBeGreaterThan(0);
    expect(result.productFiles).toBeGreaterThan(0);
    expect(result.citerDocs).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });
});

describe("a planted tree", () => {
  test.for([
    {
      why: "a bare D999 no decision file carries, above the reserved range, in product code",
      files: { ...DECISION, "packages/contracts/src/x.ts": "// per D999 — a dangling citation, no decision, above the ceiling.\nexport const x = 1;\n" },
      expected: ["packages/contracts/src/x.ts:1:8 D999"],
    },
    {
      why: "a dangling citation in a law doc, the arm the legacy scan never reached",
      files: {
        ...DECISION,
        "docs/law/Some-Law.md": "---\nkind: law\n---\n\nThe ruling is D777, which nothing minted.\n",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
      expected: ["docs/law/Some-Law.md:5:15 D777"],
    },
    {
      why: "only a NNNN-<slug>.md name with a lowercase hyphenated slug mints an id; the index and a non-slug name are citers, not members",
      files: {
        ...DECISION,
        "docs/adr/0005-Not_A_Slug.md": "# D5 outside the slug grammar\n",
        "docs/adr/README.md": "| D5 | an index row |\n",
        "packages/contracts/src/x.ts": "// per D5 — no member file name carries it.\nexport const x = 1;\n",
      },
      expected: ["docs/adr/0005-Not_A_Slug.md:1:3 D5", "docs/adr/README.md:1:3 D5", "packages/contracts/src/x.ts:1:8 D5"],
    },
    {
      why: "the reserved range is inclusive and bounded: the first number past its ceiling is dangling",
      files: { ...DECISION, "packages/contracts/src/x.ts": "// D106 is one past the reserved ceiling and has no decision.\nexport const x = 1;\n" },
      expected: ["packages/contracts/src/x.ts:1:4 D106"],
    },
    {
      why: "prose in a decision never mints an id, and the decision tree is itself a citer",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n\n## Decision\n\nAmends main's **D777 = a rolled-back ruling**.\n",
        "packages/contracts/src/x.ts": "// per D777 — the number is named in a decision's PROSE, never minted as a file.\nexport const x = 1;\n",
      },
      expected: ["docs/adr/0001-an-entry.md:5:17 D777", "packages/contracts/src/x.ts:1:8 D777"],
    },
  ])("is flagged: $why", async ({ files, expected }, { plantedTree }) => {
    const result = decisionCitations(loadPlantedTree(await plantedTree(files)));
    expect(result.findings).toEqual(expected);
  });

  test.for([
    {
      why: "a directory named *.md holds a file; it is a path, never a text read of a directory",
      files: {
        ...DECISION,
        "docs/law/weird.md/inner.md": "no citation here.\n",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
    },
    {
      why: "zero-padded file numbers resolve to bare ids, a reserved number resolves as-is, and PD-17 is another namespace",
      files: {
        ...DECISION,
        "docs/adr/0066-a-padded-id.md": "# A padded id\n",
        "docs/adr/0164-a-later-decision.md": "# A later decision\n",
        "packages/contracts/src/y.ts":
          "// per D1, D66 and D164 (zero-padded file numbers), D99 (reserved), FLAG[PD-17] (sibling namespace).\nexport const y = 1;\n",
      },
    },
    {
      why: "ADD777 and X-D777 are substrings, not citations",
      files: { ...DECISION, "packages/contracts/src/z.ts": "// ADD777 and a hyphenated X-D777 are substrings, not citations.\nexport const z = 1;\n" },
    },
    {
      why: "D165+ announces the next unminted id",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n\nThe next free number is D165+.\n",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
    },
    {
      why: "an empty law doc has no citation to judge",
      files: { ...DECISION, "docs/law/Empty-Doc.md": "", "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n" },
    },
    {
      why: "a dated review legitimately cites dead and renumbered decisions",
      files: {
        ...DECISION,
        "docs/reviews/Archaeology.md": "---\nkind: review\n---\n\nMain-era D777 and D888 are cited here as archaeology.\n",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
    },
  ])("passes: $why", async ({ files }, { plantedTree }) => {
    const result = decisionCitations(loadPlantedTree(await plantedTree(files)));
    expect(result.citerDocs + result.productFiles).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });

  test("an absent decision tree refuses instead of judging every citation dangling", async ({ plantedTree }) => {
    const tree = loadPlantedTree(
      await plantedTree({ "docs/law/Other.md": "no ledger here.\n", "packages/contracts/src/x.ts": "// per D1.\nexport const x = 1;\n" }),
    );
    expect(() => decisionCitations(tree)).toThrow("holds no decision file");
  });

  test("a decision tree with only its index refuses", async ({ plantedTree }) => {
    const tree = loadPlantedTree(
      await plantedTree({ "docs/adr/README.md": "# Decisions\n", "packages/contracts/src/x.ts": "// per D1.\nexport const x = 1;\n" }),
    );
    expect(() => decisionCitations(tree)).toThrow("holds no decision file");
  });

  test("an empty decision file refuses instead of minting silently", async ({ plantedTree }) => {
    const tree = loadPlantedTree(await plantedTree({ "docs/adr/0001-an-entry.md": "", "packages/contracts/src/x.ts": "// per D1.\nexport const x = 1;\n" }));
    expect(() => decisionCitations(tree)).toThrow("is empty");
  });
});
