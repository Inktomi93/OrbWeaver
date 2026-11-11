import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { parse } from "yaml";
import { z } from "zod";

// A version-keyed patch has to be ported before its package moves, and an unported patch fails installation, so
// every patched package must be ignored by both npm update entries.
const workspaceSchema = z.object({ patchedDependencies: z.record(z.string(), z.string()) });
const dependabotSchema = z.object({
  updates: z.array(z.object({ ["package-ecosystem"]: z.string(), ignore: z.array(z.object({ ["dependency-name"]: z.string() }).loose()).optional() })),
});

// `pnpm-workspace.yaml` keys read `name@version`; a scoped name starts with its own `@`.
const patchedName = (key: string): string => key.slice(0, key.lastIndexOf("@"));

// Dependabot reads `*` in a dependency name as a wildcard for any run of characters.
function covers(pattern: string, name: string): boolean {
  const source = pattern
    .split("*")
    .map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join(".*");
  return new RegExp(`^${source}$`, "u").test(name);
}

const uncovered = (names: readonly string[], patterns: readonly string[]): string[] =>
  names.filter((name) => !patterns.some((pattern) => covers(pattern, name)));

test("every patched dependency is ignored by both npm update entries", ({ repoRoot }) => {
  const { patchedDependencies } = workspaceSchema.parse(parse(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8")));
  const dependabot = dependabotSchema.parse(parse(readFileSync(join(repoRoot, ".github/dependabot.yml"), "utf8"), { maxAliasCount: 0 }));
  const names = Object.keys(patchedDependencies).map(patchedName);
  const npm = dependabot.updates.filter((entry) => entry["package-ecosystem"] === "npm");

  expect(names.length).toBeGreaterThan(0);
  expect(npm).toHaveLength(2);
  for (const entry of npm) {
    expect(
      uncovered(
        names,
        (entry.ignore ?? []).map((rule) => rule["dependency-name"]),
      ),
    ).toEqual([]);
  }
});

test("coverage is an exact name or a wildcard that matches the whole name", () => {
  expect(uncovered(["@playwright/test", "playwright-core", "hono"], ["@playwright/*", "hono"])).toEqual(["playwright-core"]);
  expect(uncovered(["ai", "@ai-sdk/provider"], ["@ai-sdk/*"])).toEqual(["ai"]);
  expect(uncovered(["ai"], ["ai-sdk", "a.", "*i"])).toEqual([]);
  expect(uncovered(["ab"], ["a."])).toEqual(["ab"]);
});

test("a patched dependency's name drops only its trailing version", () => {
  expect([patchedName("hono@4.13.13"), patchedName("@base-ui/react@1.9.0"), patchedName("libsql@0.6.0-pre.43")]).toEqual(["hono", "@base-ui/react", "libsql"]);
});
