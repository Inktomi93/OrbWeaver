// The release-please configuration writes the tag the version reader looks for, and the plugin authoring release counts, versions and publishes as one unit.
import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseTagRef } from "@orb/kit/version-identity";
import { expect, fixturePath, test } from "@orb/testkit/node/tool-fixtures.ts";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { parse } from "yaml";
import { z } from "zod";
import { read } from "./_workflow-support.ts";

const releaseConfig = z.object({
  packages: z.object({
    ".": z.object({
      "include-v-in-tag": z.boolean().optional(),
      "include-component-in-tag": z.boolean().optional(),
      "initial-version": z.string(),
      "bump-minor-pre-major": z.boolean().optional(),
      "bump-patch-for-minor-pre-major": z.boolean().optional(),
    }),
  }),
});

test("release-please tags a release exactly as the version reader looks for it", ({ repoRoot }) => {
  const root = releaseConfig.parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  // release-please's defaults: a `v` prefix unless turned off, a component prefix unless turned off.
  const prefix = root["include-v-in-tag"] === false ? "" : "v";
  expect(root["include-component-in-tag"]).toBe(false);
  expect(`refs/tags/${prefix}${root["initial-version"]}`).toBe(releaseTagRef(root["initial-version"]));
});

test("the first release is v0.1.0 and the version stays below 1.0: feat bumps the minor, fix the patch", ({ repoRoot }) => {
  const root = releaseConfig.parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  expect(root["initial-version"]).toBe("0.1.0");
  // A breaking change bumps the minor instead of jumping to 1.0.0; a feature keeps its minor bump.
  expect(root["bump-minor-pre-major"]).toBe(true);
  expect(root["bump-patch-for-minor-pre-major"]).not.toBe(true);
});

const pluginAuthoring = z.object({
  component: z.string(),
  "include-component-in-tag": z.literal(true),
  "include-v-in-tag": z.boolean().optional(),
  "version-file": z.string(),
  "extra-files": z.array(z.object({ type: z.literal("json"), path: z.string(), jsonpath: z.literal("$.version") })),
  "exclude-paths": z.array(z.string()),
  prerelease: z.boolean(),
  draft: z.boolean(),
  "force-tag-creation": z.boolean(),
});
const AUTHORING_PACKAGES = ["plugin-sdk", "plugin-toolchain"];

test("version-keyed patches cannot be invalidated by automatic dependency updates", ({ repoRoot }) => {
  const workspace = z.object({ patchedDependencies: z.record(z.string(), z.string()) }).parse(parse(read(repoRoot, "pnpm-workspace.yaml")));
  const dependabot = z
    .object({
      updates: z.array(
        z.object({
          "package-ecosystem": z.string(),
          ignore: z.array(z.object({ "dependency-name": z.string(), "update-types": z.array(z.string()).optional() })).optional(),
        }),
      ),
    })
    .parse(parse(read(repoRoot, ".github/dependabot.yml")));
  const ignored = dependabot.updates.find((entry) => entry["package-ecosystem"] === "npm")?.ignore ?? [];
  const names = Object.keys(workspace.patchedDependencies).map((key) => key.slice(0, key.lastIndexOf("@")));
  for (const name of names) {
    const held = ignored.find(
      (entry) => entry["dependency-name"] === name || (entry["dependency-name"].endsWith("/*") && name.startsWith(entry["dependency-name"].slice(0, -1))),
    );
    expect(held, name).toBeDefined();
    expect(held?.["update-types"], name).toBeUndefined();
  }
});

test("release-please JSON version bumps remain formatted without relaxing whitespace checks", async ({ repoRoot, plantedTree }) => {
  const paths = pluginAuthoringConfig(repoRoot)["extra-files"].map((file) => `packages/${file.path}`);
  const config = z.object({ overrides: z.array(z.record(z.string(), z.json())) }).parse(JSON.parse(read(repoRoot, "biome.json")));
  const override = config.overrides.find((entry) => JSON.stringify(entry["includes"]) === JSON.stringify(paths));
  expect(override).toEqual({ includes: paths, json: { formatter: { expand: "always" } } });
  const generated = paths.map((path) => {
    const data = z.record(z.string(), z.json()).parse(JSON.parse(read(repoRoot, path)));
    data["version"] = "9.8.7";
    // GenericJson serializes the entire document with the detected two-space indent.
    return [path, `${JSON.stringify(data, null, 2)}\n`] as const;
  });
  const tree = await plantedTree(Object.fromEntries([...generated, ["biome.json", read(repoRoot, "biome.json")]]));
  const args = ["format", ...paths, "--diagnostic-level=error", "--vcs-enabled=false"];
  const biome = join(repoRoot, "node_modules/.bin/biome");
  const clean = await spawnNiced(biome, args, { cwd: tree });
  expect(clean.code, clean.stderr).toBe(0);
  expect(clean.stdout).toContain(`Checked ${paths.length} files`);
  for (const [path, content] of generated) {
    expect(read(tree, path)).toBe(content);
    expect(z.object({ version: z.string() }).parse(JSON.parse(content)).version).toBe("9.8.7");
  }
  for (const path of paths) {
    await writeFile(fixturePath(tree, path), read(tree, path).replace('  "version":', '    "version":'));
  }
  const malformed = await spawnNiced(biome, args, { cwd: tree });
  expect(malformed.code, malformed.stderr).toBe(1);
  expect(malformed.stderr).toContain("format");
});

function pluginAuthoringConfig(repoRoot: string): z.infer<typeof pluginAuthoring> {
  const config = z.object({ packages: z.record(z.string(), z.unknown()) }).parse(JSON.parse(read(repoRoot, "release-please-config.json")));
  return pluginAuthoring.parse(config.packages["packages"]);
}

test("the plugin authoring release counts commits from the SDK and toolchain and from no other package", ({ repoRoot }) => {
  const config = pluginAuthoringConfig(repoRoot);
  // A new package that is not excluded would cut an SDK release for every change to it.
  const others = readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !AUTHORING_PACKAGES.includes(entry.name))
    .map((entry) => `packages/${entry.name}`)
    .sort();
  expect([...config["exclude-paths"]].sort()).toEqual(others);
  expect(config["extra-files"].map((file) => file.path).sort()).toEqual(AUTHORING_PACKAGES.map((name) => `${name}/package.json`));
});

test("the plugin authoring tag, manifest, version file and both package versions agree", ({ repoRoot }) => {
  const config = pluginAuthoringConfig(repoRoot);
  const manifest = z.object({ packages: z.string() }).parse(JSON.parse(read(repoRoot, ".release-please-manifest.json")));
  const version = manifest.packages;
  expect(read(repoRoot, join("packages", config["version-file"])).trim()).toBe(version);
  for (const name of AUTHORING_PACKAGES) {
    expect(z.object({ version: z.string() }).parse(JSON.parse(read(repoRoot, `packages/${name}/package.json`))).version).toBe(version);
  }
  // The template repositories and the README link this tag spelling.
  expect(`${config.component}-${config["include-v-in-tag"] === false ? "" : "v"}${version}`).toBe(`plugin-authoring-v${version}`);
});

test("plugin authoring releases stay out of latest and publish only after their tarballs are attached", ({ repoRoot }) => {
  const config = pluginAuthoringConfig(repoRoot);
  // The app's stable update check reads releases/latest, which skips pre-releases.
  expect(config.prerelease).toBe(true);
  // Immutable releases refuse new assets once published, so the release starts as a draft with its tag.
  expect(config.draft).toBe(true);
  expect(config["force-tag-creation"]).toBe(true);
  const workflow = z
    .object({ jobs: z.object({ "plugin-authoring": z.object({ if: z.string(), steps: z.array(z.object({ run: z.string().optional() })) }) }) })
    .parse(parse(read(repoRoot, ".github/workflows/release.yml")));
  const job = workflow.jobs["plugin-authoring"];
  expect(job.if).toContain("plugin_authoring_created == 'true'");
  const script = job.steps.map((step) => step.run ?? "").join("\n");
  expect(script).toContain("pnpm plugin:author-release");
  expect(script.indexOf("gh release upload")).toBeGreaterThan(-1);
  expect(script.indexOf("gh release edit")).toBeGreaterThan(script.indexOf("gh release upload"));
  expect(script).toContain("--draft=false --prerelease");
});
