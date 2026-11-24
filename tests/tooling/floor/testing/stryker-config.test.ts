// A config that names no files and owns its sandbox is what keeps a whole-tree run unspellable and the disk clean.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import { createStrykerConfig, MUTATION_WORLD_ENV } from "@orb/tooling/floor/testing/stryker-config";
import { vi } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "../../../..");
const ARID_PLUGIN = "./tooling/src/mutation-arid/index.ts";
const CHECKER_PLUGIN = "./tooling/src/mutation-checker/index.ts";

test("the config mutates nothing itself and removes its sandbox on every exit", () => {
  const config = createStrykerConfig();
  expect(config.mutate).toEqual([]);
  expect(config.cleanTempDir).toBe("always");
  expect(config).not.toHaveProperty("inPlace");
  expect(config.concurrency).toBeLessThan(readConcurrencyProfile().vitestMaxWorkers);
  expect(config["vitest"]).toMatchObject({
    configFile: "vitest.stryker.config.ts",
    pool: "forks",
    dryRunMaxWorkers: readConcurrencyProfile().vitestMaxWorkers,
  });
  expect(config.ignoreStatic).toBe(false);
});

test("the checker's world comes from the run, so the root solution file is never its program", () => {
  vi.stubEnv(MUTATION_WORLD_ENV, "packages/kit/tsconfig.json");
  expect(createStrykerConfig().tsconfigFile).toBe("packages/kit/tsconfig.json");
});

// The plugins pull a compiler in at import, which costs seconds; loading them at collection keeps that out of every case's timeout.
const PLUGINS = await Promise.all(
  (
    [
      { path: ARID_PLUGIN, names: "ignorers" },
      { path: CHECKER_PLUGIN, names: "checkers" },
    ] as const
  ).map(async ({ path, names }) => ({
    path,
    names,
    exported: ((await import(pathToFileURL(join(REPO_ROOT, path)).href)) as { readonly strykerPlugins: readonly { readonly name: string }[] }).strykerPlugins,
  })),
);

test.for(PLUGINS)("the plugin path $path exports the $names the config names", ({ path, names, exported }) => {
  const config = createStrykerConfig();
  expect(config.plugins).toContain(path);
  expect(exported.map(({ name }) => name)).toEqual(config[names]);
});

test("each call owns its option branches, because Stryker mutates what it is handed", () => {
  const first = createStrykerConfig();
  first.plugins?.push("probe-plugin");
  first.ignorePatterns?.push("probe/**");
  const second = createStrykerConfig();
  expect(second.plugins).not.toContain("probe-plugin");
  expect(second.ignorePatterns).not.toContain("probe/**");
});
