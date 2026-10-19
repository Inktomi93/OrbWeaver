// The z-index lint rules exempt two implementation homes by path; a home that no longer holds a source file is a dead exemption.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readAuthoredRepositoryInventory } from "@orb/tooling/floor/compiler/authored-repository";
import { Z_INDEX_IMPLEMENTATION_HOMES } from "../../tooling/src/verify/lib/z-index-homes.ts";

const SOURCE_ROOTS = ["packages/client/src/", "packages/ui/src/"] as const;
const SOURCE_FILE_RE = /\.tsx?$/u;

// A directory home is keyed with a trailing slash; a file home is keyed exactly.
function coveredBy(home: string, path: string): boolean {
  return home.endsWith("/") ? path.startsWith(home) : path === home;
}

function unresolvedHomes(homes: readonly string[], paths: readonly string[]): readonly string[] {
  const sources = paths.filter((path) => SOURCE_FILE_RE.test(path) && SOURCE_ROOTS.some((root) => path.startsWith(root)));
  if (sources.length === 0) {
    throw new Error("the client and ui source population is empty");
  }
  return homes.filter((home) => !sources.some((path) => coveredBy(home, path)));
}

const HOMES = Object.keys(Z_INDEX_IMPLEMENTATION_HOMES);

test("every reviewed z-index implementation home holds a client or ui source file", ({ repoRoot }) => {
  expect(HOMES.length, "the home table is non-empty").toBeGreaterThan(0);
  expect(unresolvedHomes(HOMES, readAuthoredRepositoryInventory(repoRoot).paths)).toEqual([]);
});

test("each missing z-index home is reported independently, and an empty source population refuses", () => {
  const layout = "packages/ui/src/layout/x.ts";
  const markdown = "packages/ui/src/markdown/x.ts";
  expect(unresolvedHomes(HOMES, [layout, "packages/ui/src/x.ts"])).toEqual(["packages/ui/src/markdown/"]);
  expect(unresolvedHomes(HOMES, [markdown])).toEqual(["packages/ui/src/layout/"]);
  expect(unresolvedHomes(HOMES, ["packages/client/src/x.ts"])).toEqual(HOMES);
  expect(unresolvedHomes(HOMES, [layout, markdown])).toEqual([]);
  expect(() => unresolvedHomes(HOMES, ["packages/server/src/x.ts"])).toThrow("empty");
});
