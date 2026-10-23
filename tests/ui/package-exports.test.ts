import assert from "node:assert/strict";
import { globSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

const UI = fileURLToPath(new URL("../../packages/ui", import.meta.url));
const REPOSITORY = fileURLToPath(new URL("../..", import.meta.url));
const NON_AUTHORED = new Set(["node_modules", ".git", "dist", ".cache"]);
const manifestSchema = z.object({
  name: z.string().trim().min(1),
  private: z.boolean().optional(),
  exports: z.record(z.string(), z.string()).optional().default({}),
});

test("UI public doors match the actual tree and reject missing, malformed or unresolved modules", ({ importStagingDir }) => {
  function assertExportTargets(root: string, manifest: z.infer<typeof manifestSchema>): void {
    const nativeRequire = createRequire(join(root, "package.json"));
    for (const [key, target] of Object.entries(manifest.exports)) {
      assert.ok(target.startsWith("./"), `export ${key} needs a package-relative ./ target`);
      assert.ok(!target.split("/").some((part) => NON_AUTHORED.has(part)), `export ${key} targets a non-authored directory`);
      const specifier = key === "." ? manifest.name : `${manifest.name}${key.slice(1)}`;
      assert.equal(nativeRequire.resolve(specifier), resolve(root, target), `export ${key} must resolve to its exact existing target`);
    }
  }

  function assertUiExports(packageRoot: string, admittedRoot = importStagingDir): void {
    const manifestPath = join(packageRoot, "package.json");
    const root = resolve(realpathSync(admittedRoot), relative(admittedRoot, packageRoot));
    assert.ok(lstatSync(manifestPath).isFile(), "a package manifest must be an authored regular file, not a symbolic link");
    assert.equal(realpathSync(manifestPath), join(root, "package.json"), "a package manifest cannot traverse an authored symbolic link");
    const manifest = manifestSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(manifestPath))));
    const src = join(root, "src");
    assert.ok(lstatSync(src).isDirectory(), "UI src must be an actual directory");
    for (const entry of globSync("src/**", { cwd: root, withFileTypes: true, exclude: (part) => NON_AUTHORED.has(part.name) })) {
      assert.equal(entry.isSymbolicLink(), false, `UI authored tree cannot contain a symbolic link: ${entry.name}`);
    }
    for (const top of readdirSync(src, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !NON_AUTHORED.has(entry.name))) {
      const directory = join(src, top.name);
      const index = join(directory, "index.ts");
      const topLevelModule = lstatSync(index, { throwIfNoEntry: false })?.isFile() === true;
      const members = topLevelModule
        ? [top.name]
        : readdirSync(directory, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && !NON_AUTHORED.has(entry.name))
            .map((entry) => entry.name);
      for (const name of members) {
        const target = topLevelModule ? `./src/${name}/index.ts` : `./src/${top.name}/${name}/index.ts`;
        const frontDoor = resolve(root, target);
        assert.ok(lstatSync(frontDoor, { throwIfNoEntry: false })?.isFile() === true, `module ${target} has no index.ts file`);
        assert.equal(manifest.exports[`./${name}`], target, `incorrect module export: ${name}`);
      }
    }
    assertExportTargets(root, manifest);
  }

  function plant(root: string, files: Readonly<Record<string, string>>): string {
    for (const [path, source] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    return root;
  }

  const buttonFiles = { "src/primitives/button/index.ts": "export const Button = 1;" };
  const buttonExports = { "./button": "./src/primitives/button/index.ts" };
  const manifestText = (exports: Readonly<Record<string, string>>): string => JSON.stringify({ name: "@orb/ui", private: true, exports });
  expect(() => assertUiExports(UI, REPOSITORY)).not.toThrow();

  {
    const cases: readonly Readonly<Record<string, string>>[] = [
      { "package.json": manifestText(buttonExports), ...buttonFiles, "src/primitives/hint-trigger/index.ts": "export const Hint = 1;" },
      {
        "package.json": manifestText({ ...buttonExports, "./badge": buttonExports["./button"] }),
        ...buttonFiles,
        "src/primitives/badge/index.ts": "export const Badge = 1;",
      },
      { "package.json": manifestText(buttonExports), ...buttonFiles, "src/charts/meter/meter.tsx": "export const Meter = 1;" },
      { "package.json": manifestText({ ...buttonExports, "./ghost": "./src/primitives/ghost/index.ts" }), ...buttonFiles },
      { "package.json": manifestText({ ...buttonExports, "./tilde": "~/src/primitives/button/index.ts" }), ...buttonFiles },
      { "package.json": '{"name":"@orb/ui","private":true}', ...buttonFiles, "src/primitives/badge/index.ts": "export const Badge = 1;" },
      { "package.json": manifestText({}), "src/primitives/index.ts/x.ts": "export const x = 1;" },
    ];
    for (const [index, files] of cases.entries()) {
      const root = plant(join(importStagingDir, `invalid-${index}`), files);
      expect(() => assertUiExports(root), JSON.stringify(files)).toThrow();
    }
  }

  {
    const cases: readonly Readonly<Record<string, string>>[] = [
      {
        "package.json": manifestText({ ...buttonExports, "./meter": "./src/charts/meter/index.ts", "./lib": "./src/lib/index.ts" }),
        ...buttonFiles,
        "src/charts/meter/index.ts": "export const Meter = 1;",
        "src/lib/index.ts": "export const cn = 1;",
      },
      {
        "package.json": manifestText({ ...buttonExports, "./styles/globals.css": "./src/styles/globals.css" }),
        ...buttonFiles,
        "src/styles/globals.css": ":root {}",
      },
      {
        "package.json": manifestText({ "./tokens": "./src/tokens/index.ts" }),
        "src/tokens/index.ts": "export const tokens = {};",
        "src/tokens/generated/palette.ts": "export const palette = {};",
      },
      {
        "package.json": manifestText({ ...buttonExports, "./token-contract": "./token-contract.ts" }),
        ...buttonFiles,
        "token-contract.ts": "export const contract = {};",
      },
    ];
    for (const [index, files] of cases.entries()) {
      expect(() => assertUiExports(plant(join(importStagingDir, `valid-${index}`), files))).not.toThrow();
    }
  }

  {
    for (const [index, source] of [
      undefined,
      "",
      '{"name":',
      '{"name":"@orb/ui","exports":{"./button":{"import":"./src/primitives/button/index.ts"}}}',
    ].entries()) {
      const root = plant(join(importStagingDir, `unreadable-${index}`), buttonFiles);
      if (source !== undefined) {
        writeFileSync(join(root, "package.json"), source);
      }
      expect(() => assertUiExports(root)).toThrow();
    }
    const invalidUtf8 = plant(join(importStagingDir, "invalid-utf8"), buttonFiles);
    const validPrefix = JSON.stringify({ name: "@orb/ui", exports: buttonExports }).slice(0, -1);
    writeFileSync(join(invalidUtf8, "package.json"), Buffer.concat([Buffer.from(`${validPrefix},"note":"`), Buffer.from([0xff]), Buffer.from('"}')]));
    expect(() => assertUiExports(invalidUtf8)).toThrow();
    const manifestLink = plant(join(importStagingDir, "linked-manifest"), { "manifest.json": manifestText(buttonExports), ...buttonFiles });
    symlinkSync(join(manifestLink, "manifest.json"), join(manifestLink, "package.json"));
    expect(() => assertUiExports(manifestLink)).toThrow();
    const admitted = join(importStagingDir, "admitted-ui");
    mkdirSync(join(admitted, "packages"), { recursive: true });
    const external = plant(join(importStagingDir, "external-ui"), { "package.json": manifestText({}), "src/styles/private.css": ":root {}" });
    expect(() => assertUiExports(external)).not.toThrow();
    const directoryLink = join(admitted, "packages/ui");
    symlinkSync(external, directoryLink, "dir");
    expect(() => assertUiExports(directoryLink, admitted)).toThrow();
    const canonicalBase = join(importStagingDir, "canonical-ui");
    plant(join(canonicalBase, "packages/ui"), { "package.json": manifestText(buttonExports), ...buttonFiles });
    const admittedAlias = join(importStagingDir, "admitted-ui-alias");
    symlinkSync(canonicalBase, admittedAlias, "dir");
    expect(() => assertUiExports(join(admittedAlias, "packages/ui"), admittedAlias)).not.toThrow();

    const missingTree = plant(join(importStagingDir, "missing-src"), { "package.json": manifestText({}) });
    expect(() => assertUiExports(missingTree)).toThrow("ENOENT");
  }

  {
    const root = plant(join(importStagingDir, "link"), { "package.json": manifestText(buttonExports), ...buttonFiles });
    symlinkSync(join(root, "src/primitives/button"), join(root, "src/linked"), "dir");
    expect(() => assertUiExports(root)).toThrow("symbolic link");
    for (const ignored of NON_AUTHORED) {
      const clean = plant(join(importStagingDir, `ignored-${ignored}`), {
        "package.json": manifestText(buttonExports),
        ...buttonFiles,
        [`src/${ignored}/not-a-module/private.ts`]: "export const hidden = 1;",
      });
      assertUiExports(clean);
    }
  }
});
