// A law doc that lists the members of a directory names every member the tracked tree holds there and none it lacks.
// The infra tier doc names an adapter in a `### \`infra/<name>\`` heading; the domain map names a domain in the
// backticked first cell of a row under its section heading; the Constitution's index of law names each law doc by its
// backticked file name. Each list is read from the doc and the members from the tracked files, so a new adapter,
// domain or law doc turns the test red until its doc names it.
import { expect, test } from "@orb/testkit/tooling";
import { describe } from "vitest";
import type { Tracked } from "./_sources.ts";
import { readFromRepo, trackedFiles } from "./_sources.ts";

const INFRA_ROOT = "packages/server/src/infra/";
const DOMAIN_ROOT = "packages/server/src/domain/";
const INFRA_DOC = "docs/law/Tier-3-Infra.md";
const DOMAIN_DOC = "docs/law/Constitution.md";
const INFRA_HEADING = /^#{2,6} `infra\/([\w-]+)`/gmu;
const DOMAIN_SECTION = /^## \d+\. Domain map\n([\s\S]*?)(?=^## )/mu;
const FIRST_CELL = /^\|([^|\n]*)\|/u;
const BACKTICKED = /`([^`]+)`/gu;
const LAW_ROOT = "docs/law/";
const LAW_INDEX_SECTION = /^## \d+\. Index of law\n([\s\S]*?)(?=^## )/mu;
// A bare Markdown file name: an index entry for a doc in the law directory. A path names a file elsewhere.
const LAW_DOC_NAME = /^[\w-]+\.md$/u;
// The index itself, and the file `pnpm doc index` generates from the directory's front matter.
const NOT_INDEXED: ReadonlySet<string> = new Set(["Constitution.md", "README.md"]);

/** Every directory path under `root`, at any depth, relative to it. A directory exists when a tracked file sits below it. */
function directoriesUnder(tracked: Tracked, root: string): ReadonlySet<string> {
  const found = new Set<string>();
  for (const path of tracked.paths) {
    if (path.startsWith(root)) {
      const parts = path.slice(root.length).split("/").slice(0, -1);
      for (let depth = 1; depth <= parts.length; depth += 1) {
        found.add(parts.slice(0, depth).join("/"));
      }
    }
  }
  return found;
}

/** The infra adapters a tier doc names in headings. */
function infraNames(doc: string): string[] {
  return [...doc.matchAll(INFRA_HEADING)].map((match) => match[1] ?? "");
}

/** The domains the domain map names: the backticked tokens of each table row's first cell. */
function domainNames(doc: string): string[] {
  const section = DOMAIN_SECTION.exec(doc)?.[1] ?? "";
  return section.split("\n").flatMap((line) => [...(FIRST_CELL.exec(line)?.[1] ?? "").matchAll(BACKTICKED)].map((match) => match[1] ?? ""));
}

/** The law docs the Constitution's index names: each backticked bare `.md` name in its section. */
function indexedLawDocs(doc: string): string[] {
  const section = LAW_INDEX_SECTION.exec(doc)?.[1] ?? "";
  return [...section.matchAll(BACKTICKED)].map((match) => match[1] ?? "").filter((name) => LAW_DOC_NAME.test(name));
}

/** The law directory's docs, by file name, that the index must name. */
function lawDocsOf(tracked: Tracked): ReadonlySet<string> {
  return new Set(
    [...tracked.paths].flatMap((path) => {
      const name = path.slice(LAW_ROOT.length);
      return path.startsWith(LAW_ROOT) && LAW_DOC_NAME.test(name) && !NOT_INDEXED.has(name) ? [name] : [];
    }),
  );
}

/** Each top-level directory the list omits, and each name that is no directory, as `omitted x` and `dead y`. */
function listFindings(directories: ReadonlySet<string>, named: readonly string[]): string[] {
  const top = [...directories].filter((directory) => !directory.includes("/"));
  return [
    ...top.filter((directory) => !named.some((name) => name.split("/")[0] === directory)).map((directory) => `omitted ${directory}`),
    ...named.filter((name) => !directories.has(name)).map((name) => `dead ${name}`),
  ];
}

describe("the real tree", () => {
  const tracked = trackedFiles();

  test("the infra tier doc names every adapter directory and no other", () => {
    const directories = directoriesUnder(tracked, INFRA_ROOT);
    const named = infraNames(readFromRepo(INFRA_DOC));
    // An empty read on either side would pass every finding.
    expect(directories.has("auth") && named.includes("auth")).toBe(true);
    expect(listFindings(directories, named)).toStrictEqual([]);
  });

  test("the domain map names every domain directory and no other", () => {
    const directories = directoriesUnder(tracked, DOMAIN_ROOT);
    const named = domainNames(readFromRepo(DOMAIN_DOC));
    expect(directories.has("chat") && named.includes("chat")).toBe(true);
    expect(listFindings(directories, named)).toStrictEqual([]);
  });

  test("the Constitution's index of law names every law doc and no other", () => {
    const docs = lawDocsOf(tracked);
    const named = indexedLawDocs(readFromRepo(DOMAIN_DOC));
    expect(docs.has("Spine-Testing.md") && named.includes("Spine-Testing.md")).toBe(true);
    expect(listFindings(docs, named)).toStrictEqual([]);
  });
});

describe("the readers", () => {
  const files = (...paths: string[]): Tracked => ({ paths: new Set(paths), basenames: new Set() });

  test("an infra heading list that omits an adapter or names a missing one is refused", () => {
    const directories = directoriesUnder(files(`${INFRA_ROOT}auth/a.ts`, `${INFRA_ROOT}crypto/b.ts`, `${INFRA_ROOT}root-file.ts`), INFRA_ROOT);
    const doc = "# Tier\n\n### `infra/auth` — verification\n\nSee `infra/crypto` in prose.\n\n### `infra/gone` — removed\n";
    expect(listFindings(directories, infraNames(doc))).toStrictEqual(["omitted crypto", "dead gone"]);
  });

  test("a domain map reads only its section's first cells, and a nested name must exist", () => {
    const directories = directoriesUnder(
      files(`${DOMAIN_ROOT}chat/index.ts`, `${DOMAIN_ROOT}chat/memory/m.ts`, `${DOMAIN_ROOT}export/e.ts`, `${DOMAIN_ROOT}share/s.ts`),
      DOMAIN_ROOT,
    );
    const doc = [
      "## 5. Threads",
      "| `share` | not in the map |",
      "## 6. Domain map",
      "| Domain | Owns |",
      "| - | - |",
      "| `chat` | the `share` word in a second cell |",
      "| `chat/memory` | recall |",
      "| `export`, `import` | portability |",
      "## 7. Index",
      "| `share` | outside the section |",
    ].join("\n");
    expect(domainNames(doc)).toStrictEqual(["chat", "chat/memory", "export", "import"]);
    expect(listFindings(directories, domainNames(doc))).toStrictEqual(["omitted share", "dead import"]);
  });

  test("a law index reads only its section's bare doc names, and refuses an omitted or a missing doc", () => {
    const docs = lawDocsOf(files(`${LAW_ROOT}A-Law.md`, `${LAW_ROOT}b-law.md`, `${LAW_ROOT}Constitution.md`, `${LAW_ROOT}README.md`, "docs/plans/x/design.md"));
    const doc = [
      "## 6. Domain map",
      "| `b-law.md` | outside the section |",
      "## 7. Index of law",
      "| Topic | Home |",
      "| - | - |",
      "| One | `A-Law.md` §2, `../adr/README.md` and `.claude/rules/writing.md` |",
      "| Gone | `Gone-Law.md` |",
      "## L. Lanes",
    ].join("\n");
    expect(indexedLawDocs(doc)).toStrictEqual(["A-Law.md", "Gone-Law.md"]);
    expect(listFindings(docs, indexedLawDocs(doc))).toStrictEqual(["omitted b-law.md", "dead Gone-Law.md"]);
  });
});
