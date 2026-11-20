import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { parse, parseAllDocuments } from "yaml";
import { z } from "zod";

// A version-keyed patch has to be ported before its package moves, and an unported patch fails installation, so
// every patched package must be ignored by each npm update entry that updates the workspace lockfile (directory `/`).
// An entry for another directory, such as the dev container's own lockfile, takes no workspace patches. A rule narrowed
// by `update-types` or `versions` still lets the other updates through, so only an unnarrowed rule holds a patch.
const workspaceSchema = z.object({ patchedDependencies: z.record(z.string(), z.string()) });
const dependabotSchema = z.object({
  updates: z.array(
    z.object({
      ["package-ecosystem"]: z.string(),
      directory: z.string().optional(),
      directories: z.array(z.string()).optional(),
      ignore: z
        .array(
          z.object({ ["dependency-name"]: z.string(), ["update-types"]: z.array(z.string()).optional(), versions: z.array(z.string()).optional() }).loose(),
        )
        .optional(),
    }),
  ),
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

test("every patched dependency is ignored by every npm update entry for the workspace", ({ repoRoot }) => {
  const { patchedDependencies } = workspaceSchema.parse(parse(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8")));
  const dependabot = dependabotSchema.parse(parse(readFileSync(join(repoRoot, ".github/dependabot.yml"), "utf8"), { maxAliasCount: 0 }));
  const names = Object.keys(patchedDependencies).map(patchedName);
  const npm = dependabot.updates.filter(
    (entry) => entry["package-ecosystem"] === "npm" && (entry.directory === "/" || entry.directories?.includes("/") === true),
  );

  expect(names.length).toBeGreaterThan(0);
  expect(npm.length, "the config has an npm entry for the workspace").toBeGreaterThan(0);
  for (const entry of npm) {
    expect(
      uncovered(
        names,
        (entry.ignore ?? []).filter((rule) => rule["update-types"] === undefined && rule.versions === undefined).map((rule) => rule["dependency-name"]),
      ),
    ).toEqual([]);
  }
});

// The lockfile is a stream of documents; the workspace's own is the one that records the catalogs.
const importerSection = z.record(z.string(), z.unknown()).optional();
const lockfileSchema = z.object({
  catalogs: z.record(z.string(), z.unknown()),
  importers: z.record(z.string(), z.object({ dependencies: importerSection, devDependencies: importerSection, optionalDependencies: importerSection }).loose()),
  packages: z.record(z.string(), z.object({ peerDependencies: z.record(z.string(), z.string()).optional() }).loose()),
  snapshots: z.record(z.string(), z.object({ dependencies: z.record(z.string(), z.string()).optional() }).loose()),
});

// A snapshot key reads `name@version` and may carry its peers in parentheses.
const snapshotPackage = (key: string): string => key.slice(0, key.includes("(") ? key.indexOf("(") : key.length);

/** Direct dependencies that install a patched package as a regular dependency of their own. A peer is left out: it
 *  resolves to the workspace's pinned copy, so it cannot bring a second one. */
function patchedCarriers(repoRoot: string, patched: ReadonlySet<string>): string[] {
  const documents = parseAllDocuments(readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8")).map((document) => z.unknown().parse(document.toJS()));
  const lock = lockfileSchema.parse(documents.find((document) => typeof document === "object" && document !== null && "catalogs" in document));
  const direct = new Set(
    Object.values(lock.importers).flatMap((importer) =>
      [importer.dependencies, importer.devDependencies, importer.optionalDependencies].flatMap((section) => Object.keys(section ?? {})),
    ),
  );
  const carriesPatched = ([key, snapshot]: [string, (typeof lock.snapshots)[string]]): boolean => {
    const peers = lock.packages[snapshotPackage(key)]?.peerDependencies ?? {};
    return Object.keys(snapshot.dependencies ?? {}).some((dependency) => patched.has(dependency) && !(dependency in peers));
  };
  const names = Object.entries(lock.snapshots)
    .filter(carriesPatched)
    .map(([key]) => patchedName(snapshotPackage(key)))
    .filter((name) => direct.has(name) && !patched.has(name));
  return [...new Set(names)].sort();
}

test("a direct dependency that installs a patched package as its own dependency is ignored too", ({ repoRoot }) => {
  const { patchedDependencies } = workspaceSchema.parse(parse(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8")));
  const dependabot = dependabotSchema.parse(parse(readFileSync(join(repoRoot, ".github/dependabot.yml"), "utf8"), { maxAliasCount: 0 }));
  const carriers = patchedCarriers(repoRoot, new Set(Object.keys(patchedDependencies).map(patchedName)));
  const npm = dependabot.updates.filter(
    (entry) => entry["package-ecosystem"] === "npm" && (entry.directory === "/" || entry.directories?.includes("/") === true),
  );

  expect(carriers).toContain("@ai-sdk/anthropic");
  for (const entry of npm) {
    expect(
      uncovered(
        carriers,
        (entry.ignore ?? []).filter((rule) => rule["update-types"] === undefined && rule.versions === undefined).map((rule) => rule["dependency-name"]),
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
