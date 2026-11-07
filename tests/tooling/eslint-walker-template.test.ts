import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { resolvedConfig } from "./_eslint-config.ts";

const RULE = "no-restricted-syntax";
const WALKER_FILE = "tooling/src/ui-audit/ops/walker/probe.ts";

// A walker segment is a template literal whose cooked text is the page's code: a single-backslash class loses its
// backslash on the way, and the page then runs a regex over the bare letter.
test("a walker segment refuses a single-backslash regex class and accepts the escaped one", { timeout: 120_000 }, async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const filename = join(repoRoot, WALKER_FILE);
  const config = await resolvedConfig(eslint, filename);
  const linter = new Linter();
  const native = {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
    rules: { [RULE]: config.rules[RULE] ?? "off" },
  };
  for (const source of [
    "const a = `x.split(/\\s+/)`;",
    'const a = `x.replace(/\\s*/g, "")`;',
    "const a = `x.split(/\\d+/)`;",
    "const a = `x.split(/\\w+/)`;",
    "const a = `x.split(/s+/)`;",
  ]) {
    expect(
      linter.verify(source, native, { filename }).map(({ ruleId }) => ruleId),
      source,
    ).toEqual([RULE]);
  }
  for (const source of ["const a = `x.split(/\\\\s+/)`;", 'const a = `x.replace(/\\\\s*/g, "")`;', "const a = `x.split(/ +/)`;"]) {
    expect(linter.verify(source, native, { filename }), source).toEqual([]);
  }
  // the block that adds this selector replaces the file-wide restrictions, so it must carry the process ones too
  const spawned = linter.verify('spawn("rm", ["target"]);', native, { filename });
  expect(spawned.map(({ ruleId }) => ruleId)).toEqual([RULE]);
});

// `tagName` is uppercase only for HTML-namespace elements, so an uppercase SVG name is a comparison that can never match.
test("a walker segment refuses an uppercase SVG tag and accepts the lowercase name", { timeout: 120_000 }, async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const filename = join(repoRoot, WALKER_FILE);
  const config = await resolvedConfig(eslint, filename);
  const linter = new Linter();
  const native = {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
    rules: { [RULE]: config.rules[RULE] ?? "off" },
  };
  for (const source of [
    'const a = `if (tag === "SVG") return true;`;',
    "const a = `if (el.tagName === 'PATH') return true;`;",
    "const a = `var TAGS = { SVG: 1 };`;",
    "const a = `var TAGS = { SVG: true };`;",
    'const a = `var TAGS = { FOREIGNOBJECT: "art" };`;',
    "const a = `if (/^(SVG|IMG)$/.test(el.tagName)) return true;`;",
    "const a = `if (/^(IMG|TEXT)$/.test(el.tagName)) return true;`;",
    "const a = `if (/^ELLIPSE$/.test(tag)) return true;`;",
    'const a = `if (tag === "LINE" || tag === "IMAGE") return true;`;',
  ]) {
    expect(
      linter.verify(source, native, { filename }).map(({ ruleId }) => ruleId),
      source,
    ).toEqual([RULE]);
  }
  for (const source of [
    'const a = `if (el.localName === "svg") return true;`;',
    'const a = `if (el.tagName === "IMG") return true;`;',
    "const a = `// an inline SVG paints`;",
    "const a = `// BOUNDED BY ITS MEASURED RECT: a pseudo`;",
    "const a = `if (/^(IMG|VIDEO)$/.test(el.tagName)) return true;`;",
    "const a = `// TEXT: the label the census reads`;",
  ]) {
    expect(linter.verify(source, native, { filename }), source).toEqual([]);
  }
});
