import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { customPropertyUses, RUNTIME_CUSTOM_PROPERTIES } from "../../../tooling/src/css-names/index.ts";

const dynamicClass = ["w-[var(", "--probe-dyn-", "$", "{key}", ")]"].join("");

const SOURCES = {
  "packages/ui/src/styles/theme.css": ":root { --probe-sheet: 1; width: var(--probe-class); }",
  "packages/client/src/index.ts": 'export const A = "[--probe-class:1] w-[var(--probe-top,1)]";',
  "packages/client/src/nested/reader.tsx": `export const A = (key: string) => \`${dynamicClass}\`;
export const B = (node: Element) => getComputedStyle(node).getPropertyValue('--probe-style');`,
  "packages/ui/src/index.tsx": 'export const A = "text-(length:--probe-sheet)";',
  "packages/client/src/node_modules/ignored.ts": 'export const A = "[--probe-dependency:1] w-(--probe-dependency)";',
  "packages/ui/src/node_modules/ignored.css": ":root { --probe-dependency-sheet: 1; width: var(--probe-dependency-sheet); }",
};

function plantSources(root: string): void {
  for (const [path, text] of Object.entries(SOURCES)) {
    plantFile(root, path, text);
  }
}

test("the real source census agrees in a checkout, a standalone archive and an ignored archive under a Git parent", ({ scratch }) => {
  const checkout = plantDir(scratch, "checkout");
  execFileSync("git", ["init", "--quiet"], { cwd: checkout });
  plantFile(checkout, ".gitignore", ".cache/\n**/node_modules/\n");
  plantSources(checkout);
  const standalone = plantDir(scratch, "standalone");
  plantSources(standalone);
  const nested = plantDir(checkout, ".cache/archive");
  plantSources(nested);

  const uses = customPropertyUses(checkout);
  expect(uses.declared).toContain("--probe-sheet");
  expect(uses.declared).toContain("--probe-class");
  expect(uses.read).toEqual(new Set(["--probe-class", "--probe-top", "--probe-style", "--probe-sheet"]));
  expect(uses.readPrefixes).toEqual(["--probe-dyn-"]);
  expect(uses.declared).not.toContain("--probe-dependency");
  expect(uses.declared).not.toContain("--probe-dependency-sheet");
  expect(customPropertyUses(standalone)).toEqual(uses);
  expect(customPropertyUses(nested)).toEqual(uses);
});

test("valid owned source files with no property matches are a successful empty read census", ({ scratch }) => {
  plantFile(scratch, "packages/client/src/plain.ts", "export const value = 1;");
  const uses = customPropertyUses(scratch);

  for (const name of Object.keys(RUNTIME_CUSTOM_PROPERTIES)) {
    expect(uses.declared).toContain(name);
  }
  expect(uses.read).toEqual(new Set());
  expect(uses.readPrefixes).toEqual([]);
});

test("empty and wrong source roots fail instead of reporting an empty clean census", ({ scratch }) => {
  expect(() => customPropertyUses(scratch)).toThrow("no owned source files");
  plantFile(scratch, "packages/elsewhere/ignored.css", ":root { --not-owned: 1; }");
  expect(() => customPropertyUses(scratch)).toThrow("no owned source files");
});

test("missing and non-directory roots retain their filesystem errors", ({ scratch }) => {
  expect(() => customPropertyUses(join(scratch, "missing"))).toThrow(/ENOENT/u);
  const file = plantFile(scratch, "not-a-directory", "");
  expect(() => customPropertyUses(file)).toThrow(/ENOTDIR/u);
});

test("an owned source path that cannot be read as a file fails the census", ({ scratch }) => {
  plantDir(scratch, "packages/client/src/unreadable.ts");
  expect(() => customPropertyUses(scratch)).toThrow(/EISDIR/u);
});
