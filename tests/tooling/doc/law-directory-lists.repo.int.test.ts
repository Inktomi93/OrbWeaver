// A law doc that lists the members of a directory names every directory the tracked tree holds there and no directory it
// lacks. The infra tier doc names an adapter in a `### \`infra/<name>\`` heading; the domain map names a domain in the
// backticked first cell of a row under its section heading. Both lists are read from the doc and the directories from
// the tracked files, so a new adapter or domain turns the test red until its doc names it.
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
});
