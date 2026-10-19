// A backticked file path in a decision file must name a file on the tree: a rename or delete that skips the ledger leaves a dead pointer.
// Only path-shaped text is judged (a `/` and a known extension); symbols, config keys and code samples are not files.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { describe } from "vitest";
import { LEDGER_DEFINITIONS } from "../../../tooling/src/verify/contract/resource-document.ts";
import type { RepoTree } from "./_tree.ts";
import { loadPlantedTree, loadTree } from "./_tree.ts";

const LEDGER = LEDGER_DEFINITIONS["d-ledger"];
const LEDGER_DIR = `${LEDGER.tree}/`;
const PATH_EXTENSIONS = /\.(ts|tsx|md|json|sql|cjs|mjs|css|html|sh|yaml|yml)$/u;
// A glob, brace, placeholder, relative prefix, absolute path or package specifier is a prose pattern, not a file cite.
const NON_LITERAL_RE = /[*{}<>]|^\.\.\/|^\.\/|^\/|^@orb\//u;
// Decisions cite `contracts/rpg/foo.ts` for `packages/contracts/src/rpg/foo.ts`: the first segment names the package.
const PACKAGE_SOURCE_PREFIXES: Readonly<Record<string, string>> = {
  contracts: "packages/contracts/src/",
  kit: "packages/kit/src/",
  db: "packages/db/src/",
  ui: "packages/ui/src/",
  client: "packages/client/src/",
  server: "packages/server/src/",
};
// Decisions also cite paths relative to one of these roots.
const RESOLUTION_PREFIXES = [
  "packages/server/src/",
  "packages/client/src/",
  "packages/kit/src/",
  "packages/contracts/src/",
  "packages/db/src/",
  "packages/ui/src/",
  "tooling/src/",
  "tests/",
  "scripts/",
  "docs/",
];

interface LedgerPaths {
  readonly findings: readonly string[];
  readonly decisions: number;
  readonly linesScanned: number;
}

function decisionFiles(tree: RepoTree): readonly string[] {
  const files = tree.paths.filter((path) => {
    const name = path.slice(LEDGER_DIR.length);
    return path.startsWith(LEDGER_DIR) && !name.includes("/") && LEDGER.member.test(name);
  });
  if (files.length === 0) {
    throw new Error(`${LEDGER_DIR} holds no decision file`);
  }
  for (const path of files) {
    if (tree.read(path) === "") {
      throw new Error(`decision file ${path} is empty`);
    }
  }
  return files;
}

/** Backticked path-shaped text outside a strikethrough: struck text records a file that was deleted on purpose. */
function pathCites(text: string): readonly { readonly path: string; readonly line: number }[] {
  return text.split(/\r?\n/u).flatMap((line, index) =>
    [...line.matchAll(/`([^`]+)`/gu)].flatMap((match) => {
      const candidate = match[1] ?? "";
      const struck = (line.slice(0, match.index).match(/~~/gu) ?? []).length % 2 !== 0;
      return !struck && candidate.includes("/") && PATH_EXTENSIONS.test(candidate) && !NON_LITERAL_RE.test(candidate)
        ? [{ path: candidate, line: index + 1 }]
        : [];
    }),
  );
}

function ledgerPaths(tree: RepoTree): LedgerPaths {
  const decisions = decisionFiles(tree);
  const tracked = new Set(tree.paths);
  // Every `/`-suffix of every tracked path, for a path cited relative to a domain root.
  const suffixes = new Set<string>();
  for (const path of tree.paths) {
    for (let slash = path.indexOf("/"); slash !== -1; slash = path.indexOf("/", slash + 1)) {
      suffixes.add(path.slice(slash));
    }
  }
  const resolves = (cited: string): boolean => {
    const packagePrefix = PACKAGE_SOURCE_PREFIXES[cited.slice(0, cited.indexOf("/"))];
    return (
      tracked.has(cited) ||
      RESOLUTION_PREFIXES.some((prefix) => tracked.has(`${prefix}${cited}`)) ||
      (packagePrefix !== undefined && tracked.has(`${packagePrefix}${cited.slice(cited.indexOf("/") + 1)}`)) ||
      suffixes.has(`/${cited}`)
    );
  };
  const findings = decisions.flatMap((file) =>
    pathCites(tree.read(file))
      .filter((cite) => !resolves(cite.path))
      .map((cite) => `${file}:${String(cite.line)} ${cite.path}`),
  );
  const linesScanned = decisions.reduce((total, file) => total + tree.read(file).split(/\r?\n/u).length, 0);
  return { findings, decisions: decisions.length, linesScanned };
}

describe("the real tree", () => {
  test("every backticked file path in a decision file resolves on the tree", ({ repoRoot }) => {
    const result = ledgerPaths(loadTree(repoRoot));
    // A walk that read nothing would pass: the denominators must be live.
    expect(result.decisions).toBeGreaterThan(0);
    expect(result.linesScanned).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });
});

describe("a planted tree", () => {
  test.for([
    {
      why: "a file path in a decision that names a file not on the tree",
      files: { "docs/adr/0001-an-entry.md": "- **D1** — `domain/chat/verbs/nonexistent-file.ts` is the home for chat reads.\n" },
      expected: ["docs/adr/0001-an-entry.md:1 domain/chat/verbs/nonexistent-file.ts"],
    },
    {
      why: "a fully qualified packages path that does not exist, the shape after a domain delete or rename",
      files: { "docs/adr/0001-an-entry.md": "- **D2** — See `packages/server/src/domain/deleted/service.ts` for the implementation.\n" },
      expected: ["docs/adr/0001-an-entry.md:1 packages/server/src/domain/deleted/service.ts"],
    },
  ])("is flagged: $why", async ({ files, expected }, { plantedTree }) => {
    expect(ledgerPaths(loadPlantedTree(await plantedTree(files))).findings).toEqual(expected);
  });

  test.for([
    {
      why: "backticked text without a slash and an extension is not a file path",
      files: { "docs/adr/0001-an-entry.md": "- **D1** — `domain/chat` is the chat domain home.\n- **D2** — the `can()` kernel is the one permission site.\n" },
    },
    {
      why: "a decision with no backticked file path stays clean",
      files: { "docs/adr/0001-an-entry.md": "- **D1** — entry.\n", "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n" },
    },
    {
      why: "a path resolves as a package-name shorthand, a root-relative path and a suffix of a domain path",
      files: {
        "docs/adr/0001-an-entry.md":
          "- **D1** — `contracts/rpg/foo.ts`, `domain/chat/verbs/read.ts` and `verbs/read.ts` and ~~`domain/gone/old.ts`~~ struck.\n",
        "packages/contracts/src/rpg/foo.ts": "export const y = 1;\n",
        "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n",
      },
    },
  ])("passes: $why", async ({ files }, { plantedTree }) => {
    const result = ledgerPaths(loadPlantedTree(await plantedTree(files)));
    expect(result.linesScanned).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });

  test("a tree with no decision file refuses instead of reporting zero dead paths over a ledger it never read", async ({ plantedTree }) => {
    const tree = loadPlantedTree(await plantedTree({ "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n" }));
    expect(() => ledgerPaths(tree)).toThrow("holds no decision file");
  });
});
