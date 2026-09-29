import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compilePluginDirectory, stalePluginArtifacts, writePluginArtifacts } from "@orb/plugin-toolchain";
import { expect, test } from "../support/tool-fixtures.ts";

async function authoredPlugin(root: string, sources: Readonly<Record<string, string>>): Promise<string> {
  const directory = join(root, "plugin");
  await mkdir(directory, { recursive: true });
  await Promise.all(Object.entries(sources).map(([name, source]) => writeFile(join(directory, name), source)));
  return directory;
}

function authorProject(repoRoot: string, pluginDirectory: string): { readonly pluginDirectory: string; readonly sdkDirectory: string } {
  return { pluginDirectory, sdkDirectory: join(repoRoot, "packages", "plugin-sdk") };
}

test("each authored realm sees only its own SDK door", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {
    "main.ts": "const host = orb.ui(1); host.render('x', { kind: 'text', value: 'x' });\n",
    "ui.ts": "const ui = orb.host(1); ui.log.info('wrong realm');\n",
  });

  const result = await compilePluginDirectory(authorProject(repoRoot, directory));

  expect(result.artifacts).toEqual([]);
  expect(result.diagnostics.map(({ file, message }) => `${file.endsWith("main.ts") ? "main" : "ui"}: ${message}`)).toEqual(
    expect.arrayContaining([expect.stringContaining("main: Property 'ui' does not exist"), expect.stringContaining("ui: Property 'host' does not exist")]),
  );
});

test("QuickJS sources reject modules, ambient APIs, and nondeterministic entropy", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {
    "main.ts": [
      "import './other.js';",
      "void import('./other.js');",
      "const host = orb.host(1);",
      "host.log.info(String(document));",
      ["host.log.info(String(Date", ".now()));"].join(""),
      "host.log.info(String(globalThis.fetch));",
      "host.log.info(String(globalThis['process']));",
      ["host.log.info(String(Math", ".random()));"].join(""),
    ].join("\n"),
  });

  const result = await compilePluginDirectory(authorProject(repoRoot, directory));
  const messages = result.diagnostics.map(({ message }) => message);

  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining("imports and exports are not available"),
      "document is unavailable in the main runtime",
      "Date is unavailable in the main runtime",
      "fetch is unavailable in the main runtime",
      "process is unavailable in the main runtime",
      "Math.random is unavailable in QuickJS guests; use the injected random seam",
    ]),
  );
  expect(result.artifacts).toEqual([]);
});

test("author programs enforce strict parameters, returns, and catch values", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {
    "main.ts": [
      "function implicit(value) { return String(value); }",
      "function missing(flag: boolean): string { if (flag) return 'yes'; }",
      "try { throw new Error('x'); } catch (error) { orb.host(1).log.info(error.message); }",
      "orb.host(1).log.info(implicit('ready'));",
    ].join("\n"),
  });

  const result = await compilePluginDirectory(authorProject(repoRoot, directory));
  const messages = result.diagnostics.map(({ message }) => message);

  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Parameter 'value' implicitly has an 'any' type"),
      expect.stringContaining("Function lacks ending return statement"),
      expect.stringContaining("'error' is of type 'unknown'"),
    ]),
  );
  expect(result.artifacts).toEqual([]);
});

test("frame sources receive DOM types but neither the QuickJS door nor network APIs", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {
    "frame.ts": "document.body.textContent = String(orb.host(1)) + String(fetch('/leak'));\n",
    "main.ts": "const FRAME = `<script>/* @orb-frame-script */</script>`; orb.host(1).log.info(FRAME);\n",
  });

  const result = await compilePluginDirectory(authorProject(repoRoot, directory));

  const messages = result.diagnostics.map(({ message }) => message);
  expect(messages).toEqual(expect.arrayContaining(["orb is unavailable in the frame runtime", "fetch is unavailable in the frame runtime"]));
  expect(messages).not.toContain("document is unavailable in the frame runtime");
  expect(result.artifacts).toEqual([]);
});

test("emit is deterministic and a changed or missing artifact is stale", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {
    "main.ts": "const host = orb.host(1); host.log.info(String(host.version));\n",
  });

  const first = await compilePluginDirectory(authorProject(repoRoot, directory));
  const second = await compilePluginDirectory(authorProject(repoRoot, directory));
  expect(first.diagnostics).toEqual([]);
  expect(second.diagnostics).toEqual([]);
  expect(first.artifacts.map(({ bytes }) => new TextDecoder().decode(bytes))).toEqual(second.artifacts.map(({ bytes }) => new TextDecoder().decode(bytes)));

  await writePluginArtifacts(first);
  expect(await stalePluginArtifacts(second)).toEqual([]);
  const outputPath = join(directory, ".orb-plugin", "build", "main.js");
  await writeFile(outputPath, "stale\n");
  expect(await stalePluginArtifacts(second)).toEqual([outputPath]);
  await writePluginArtifacts(second);
  expect(await readFile(outputPath, "utf8")).toContain("orb.host(1)");
});

test("a direct-Git template checks committed root outputs without treating them as source", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {});
  const sourceDirectory = join(directory, "src");
  await mkdir(sourceDirectory);
  await writeFile(join(sourceDirectory, "main.ts"), "orb.host(1).log.info('ready');\n");
  await writeFile(join(sourceDirectory, "ui.ts"), "orb.ui(1).render('home', { kind: 'text', value: 'ready' });\n");
  const project = {
    ...authorProject(repoRoot, directory),
    sourceDirectory,
    outputDirectory: directory,
  };

  const first = await compilePluginDirectory(project);
  expect(first.diagnostics).toEqual([]);
  await writePluginArtifacts(first);
  expect(await stalePluginArtifacts(await compilePluginDirectory(project))).toEqual([]);

  await writeFile(join(sourceDirectory, "main.ts"), "orb.host(1).log.info('changed');\n");
  expect(await stalePluginArtifacts(await compilePluginDirectory(project))).toEqual([join(directory, "main.js")]);

  await writeFile(join(sourceDirectory, "main.ts"), "orb.host(1).log.info('ready');\n");
  await rm(join(sourceDirectory, "ui.ts"));
  const withoutUi = await compilePluginDirectory(project);
  expect(await stalePluginArtifacts(withoutUi)).toEqual([join(directory, "ui.js")]);
  await writePluginArtifacts(withoutUi);
  await expect(readFile(join(directory, "ui.js"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

test("a frame source must have exactly one injection marker in main.ts", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {
    "frame.ts": "document.body.textContent = 'ready';\n",
    "main.ts": "orb.host(1).log.info('no frame marker');\n",
  });

  const result = await compilePluginDirectory(authorProject(repoRoot, directory));

  expect(result.diagnostics.map(({ message }) => message)).toContain("frame source requires exactly one /* @orb-frame-script */ marker in main.ts");
  expect(result.artifacts).toEqual([]);
});

test("generated-only optional entries are refused instead of silently packed", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {
    "main.ts": "orb.host(1).log.info('ready');\n",
    "ui.js": "orb.ui(1).render('stale', { kind: 'text', value: 'stale' });\n",
  });

  const result = await compilePluginDirectory(authorProject(repoRoot, directory));

  expect(result.diagnostics.map(({ message }) => message)).toContain("ui.js exists without authored ui.ts");
});

test("legacy generated JavaScript beside source is refused", async ({ repoRoot, scratch }) => {
  const directory = await authoredPlugin(scratch, {
    "main.ts": "orb.host(1).log.info('ready');\n",
    "main.js": "orb.host(1).log.info('stale');\n",
  });

  const result = await compilePluginDirectory(authorProject(repoRoot, directory));

  expect(result.diagnostics.map(({ message }) => message)).toContain(
    "main.js is generated output; keep it in the configured output directory, not beside source",
  );
});
