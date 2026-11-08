// A config that names no files and owns its sandbox is what keeps a whole-tree run unspellable and the disk clean.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import { createStrykerConfig, MUTATION_WORLD_ENV } from "@orb/tooling/floor/testing/stryker-config";
import { vi } from "vitest";

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

test.for([
  { path: ARID_PLUGIN, names: "ignorers" },
  { path: CHECKER_PLUGIN, names: "checkers" },
] as const)("the plugin path $path exports the $names the config names", async ({ path, names }, { repoRoot }) => {
  const config = createStrykerConfig();
  expect(config.plugins).toContain(path);
  const plugin = (await import(pathToFileURL(join(repoRoot, path)).href)) as { readonly strykerPlugins: readonly { readonly name: string }[] };
  expect(plugin.strykerPlugins.map(({ name }) => name)).toEqual(config[names]);
});

test("each call owns its option branches, because Stryker mutates what it is handed", () => {
  const first = createStrykerConfig();
  first.plugins?.push("probe-plugin");
  first.ignorePatterns?.push("probe/**");
  const second = createStrykerConfig();
  expect(second.plugins).not.toContain("probe-plugin");
  expect(second.ignorePatterns).not.toContain("probe/**");
});
