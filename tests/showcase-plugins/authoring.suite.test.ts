import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { HOST_FUNCTION_CAPABILITY, UI_PROXYABLE_HOST_FUNCTIONS } from "@orb/contracts/plugin";
import { getPluginQuickJS } from "@orb/server/infra/plugin-host";
import { budget } from "@orb/tooling/_shared/load-budget";
import { compileShowcasePlugins, writeShowcaseArtifacts } from "@orb/tooling/plugin-author-showcase";
import { isFail } from "quickjs-emscripten-core";
import { expect, test } from "../support/tool-fixtures.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const BUNDLES_ROOT = join(REPO_ROOT, "packages", "showcase-plugins", "bundles");
// Compiles every showcase plugin TWICE (the determinism check), so the default 5s ceiling is too tight
// under contention even though a quiet box clears it comfortably.
const COMPILE_TWICE_TIMEOUT = budget(5000);

test("a clean source tree materializes the complete deterministic runtime zip tree", { tags: "source-freshness", timeout: COMPILE_TWICE_TIMEOUT }, async ({
  scratch,
}) => {
  const result = await compileShowcasePlugins(REPO_ROOT);
  const repeated = await compileShowcasePlugins(REPO_ROOT);
  expect(result.diagnostics).toEqual([]);
  expect(repeated.diagnostics).toEqual([]);

  const pluginDirectories = (await readdir(BUNDLES_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  const authoredSources: string[] = [];
  for (const plugin of pluginDirectories) {
    const names = await readdir(join(BUNDLES_ROOT, plugin));
    authoredSources.push(...names.filter((name) => name === "main.ts" || name === "ui.ts").map((name) => `${plugin}/${name}`));
    expect(
      names.filter((name) => name.endsWith(".js")),
      `${plugin} must not track generated JavaScript`,
    ).toEqual([]);
  }
  const emittedSources = result.artifacts.map(({ sourcePath }) => relative(BUNDLES_ROOT, sourcePath)).toSorted();

  expect(emittedSources).toEqual(authoredSources.toSorted((left, right) => left.localeCompare(right)));
  expect(result.artifacts).toHaveLength(10);
  expect(result.bundles.map(({ slug }) => slug)).toHaveLength(9);
  expect(result.bundles.map(({ bytes }) => bytes)).toEqual(repeated.bundles.map(({ bytes }) => bytes));
  const output = join(scratch, "bundles");
  const written = await writeShowcaseArtifacts(REPO_ROOT, output);
  expect(written.diagnostics).toEqual([]);
  expect((await readdir(output)).toSorted()).toEqual(result.bundles.map(({ slug }) => `${slug}.zip`).toSorted());
  const pocketArcade = result.artifacts.find(({ sourcePath }) => sourcePath.endsWith("pocket-arcade/main.ts"));
  expect(new TextDecoder().decode(pocketArcade?.bytes)).toContain("document.getElementById(id)");
  expect(new TextDecoder().decode(pocketArcade?.bytes)).not.toContain("/* @orb-frame-script */");
});

test("every emitted QuickJS artifact parses and activates with no ambient Node or DOM globals", async () => {
  const result = await compileShowcasePlugins(REPO_ROOT);
  expect(result.diagnostics).toEqual([]);
  const quickjs = await getPluginQuickJS();
  const mainPrelude = `
    globalThis.orb = (() => {
      const host = {
        version: 1,
        grants: ["ui.frame"],
        clock: { nowEpochMs: () => 0 },
        random: { next: () => 0.5 },
        ids: { mint: () => "id" },
        tokens: { count: (text) => text.length },
        log: { info: () => {}, warn: () => {}, error: () => {} }
      };
      for (const name of ${JSON.stringify(Object.keys(HOST_FUNCTION_CAPABILITY))}) {
        const [group, method] = name.split(".");
        host[group] = host[group] || {};
        host[group][method] = () => {};
      }
      host.ui.registerFrame = (definition) => { globalThis.__registeredFrame = definition; };
      return { host: () => host };
    })();
  `;
  const uiPrelude = `
    globalThis.orb = (() => {
      const host = {};
      for (const name of ${JSON.stringify(UI_PROXYABLE_HOST_FUNCTIONS)}) {
        const [group, method] = name.split(".");
        host[group] = host[group] || {};
        host[group][method] = () => {};
      }
      return { ui: () => ({
        version: 1,
        grants: [],
        clock: { nowEpochMs: () => 0 },
        random: { next: () => 0.5 },
        tokens: { count: (text) => text.length },
        log: { info: () => {}, warn: () => {}, error: () => {} },
        render: () => {},
        onEvent: () => {},
        host
      }) };
    })();
  `;

  let pocketArcadeFrameStatus: string | undefined;
  for (const artifact of result.artifacts) {
    const context = quickjs.newContext();
    try {
      const code = new TextDecoder().decode(artifact.bytes);
      const evaluated = context.evalCode(`${artifact.runtime === "ui" ? uiPrelude : mainPrelude}\n${code}\n"activated";`);
      if (isFail(evaluated)) {
        const error = context.dump(evaluated.error);
        evaluated.error.dispose();
        throw new Error(`${relative(BUNDLES_ROOT, artifact.outputPath)} failed in QuickJS: ${JSON.stringify(error)}`);
      }
      expect(context.getString(evaluated.value), relative(BUNDLES_ROOT, artifact.outputPath)).toBe("activated");
      evaluated.value.dispose();
      if (artifact.outputPath.endsWith("pocket-arcade/main.js")) {
        const frame = context.evalCode('globalThis.__registeredFrame.html.includes("document.getElementById") ? "embedded" : "missing"');
        if (isFail(frame)) {
          const error = context.dump(frame.error);
          frame.error.dispose();
          throw new Error(`pocket-arcade frame inspection failed: ${JSON.stringify(error)}`);
        }
        pocketArcadeFrameStatus = context.getString(frame.value);
        frame.value.dispose();
      }
    } finally {
      context.dispose();
    }
  }
  expect(pocketArcadeFrameStatus).toBe("embedded");
});
