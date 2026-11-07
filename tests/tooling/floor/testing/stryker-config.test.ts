// A config that names no files and owns its sandbox is what keeps a whole-tree run unspellable and the disk clean.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import { createStrykerConfig, MUTATION_WORLD_ENV } from "@orb/tooling/floor/testing/stryker-config";
import { vi } from "vitest";

const ARID_PLUGIN = "./tooling/src/mutation-arid/index.ts";

test("the config mutates nothing itself and removes its sandbox on every exit", () => {
  const config = createStrykerConfig();
  expect(config.mutate).toEqual([]);
  expect(config.cleanTempDir).toBe("always");
  expect(config).not.toHaveProperty("inPlace");
  expect(config.concurrency).toBe(readConcurrencyProfile().vitestMaxWorkers);
  expect(config["vitest"]).toMatchObject({ configFile: "vitest.stryker.config.ts", pool: "forks" });
  expect(config.checkers).toEqual(["typescript"]);
});

test("the checker's world comes from the run, so the root solution file is never its program", () => {
  vi.stubEnv(MUTATION_WORLD_ENV, "packages/kit/tsconfig.json");
  expect(createStrykerConfig().tsconfigFile).toBe("packages/kit/tsconfig.json");
});

test("the plugin path Stryker imports exports the ignorer the config names", async ({ repoRoot }) => {
  const config = createStrykerConfig();
  expect(config.plugins).toContain(ARID_PLUGIN);
  const plugin = (await import(pathToFileURL(join(repoRoot, ARID_PLUGIN)).href)) as { readonly strykerPlugins: readonly { readonly name: string }[] };
  expect(plugin.strykerPlugins.map(({ name }) => name)).toEqual(config.ignorers);
});

test("each call owns its option branches, because Stryker mutates what it is handed", () => {
  const first = createStrykerConfig();
  first.plugins?.push("probe-plugin");
  first.ignorePatterns?.push("probe/**");
  const second = createStrykerConfig();
  expect(second.plugins).not.toContain("probe-plugin");
  expect(second.ignorePatterns).not.toContain("probe/**");
});
