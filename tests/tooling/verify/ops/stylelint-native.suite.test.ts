import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Selection } from "@orb/tooling/verify";
import { PRODUCT_STYLESHEETS, REGISTRY, runStylelint, STYLELINT_CONFIG_PATH } from "@orb/tooling/verify";
import stylelint from "stylelint";

async function lint(repoRoot: string, code: string, path = "packages/ui/src/probe.css"): Promise<stylelint.LinterResult> {
  const result = await stylelint.lint({ cwd: repoRoot, configFile: join(repoRoot, "stylelint.config.js"), code, codeFilename: join(repoRoot, path) });
  expect(result.results.flatMap((row) => row.invalidOptionWarnings)).toEqual([]);
  expect(result.results.flatMap((row) => row.parseErrors)).toEqual([]);
  return result;
}

const CASES = [
  ["motion raw", "orb/motion-token-purity", ".x { transition: opacity 220ms ease-out; }", 2],
  [
    "motion zero linear steps",
    "orb/motion-token-purity",
    ".x { transition-duration:0s; animation:loop var(--motion-base) linear; transition-timing-function:steps(4,end); }",
    0,
  ],
  [
    "motion co-motion",
    "orb/motion-token-purity",
    ".x { transition-timing-function:var(--drawer-ease-out); animation:loop calc(var(--motion-base)*.6) linear; }",
    0,
  ],
  ["motion simple calc skip", "orb/motion-token-purity", ".x { animation-duration:calc(110ms * 2); }", 0],
  ["motion nested calc raw", "orb/motion-token-purity", ".x { animation-duration:calc(var(--motion-base) + 2ms); }", 1],
  [
    "motion reduced duration not ease",
    "orb/motion-token-purity",
    "@media(prefers-reduced-motion:reduce){.x{animation-duration:.01ms!important;transition-timing-function:ease-out;}}",
    1,
  ],
  ["motion manual floor", "orb/motion-token-purity", "[data-reduced-motion]{animation-duration:.01ms!important;}", 0],
  ["motion excluded longhands", "orb/motion-token-purity", ".x{animation-delay:220ms;animation-timing-function:ease-out;--motion-custom:220ms;}", 0],
  ["motion comment", "orb/motion-token-purity", ".x{transition:opacity /* 220ms ease-out */ var(--motion-base) linear;}", 0],
  ["color hex once", "orb/no-raw-color-in-css", ".x{background:linear-gradient(#abc,#def);}", 1],
  ["color function", "orb/no-raw-color-in-css", ".x{color:oklch(.5 .2 30);}", 1],
  ["color relative", "orb/no-raw-color-in-css", ".x{color:oklch(from var(--color-primary) l c h / .5);}", 0],
  ["color quote and comment", "orb/no-raw-color-in-css", '.x{content:"#abc rgb(0 0 0)";color:/* #fff */var(--color-primary);}', 0],
  ["color URL old lexical scope", "orb/no-raw-color-in-css", ".x{mask:url(#fff);}", 1],
  ["color invalid hex old limit", "orb/no-raw-color-in-css", ".x{color:#foobar;}", 0],
  ["color mixed var old limit", "orb/no-raw-color-in-css", ".x{color:rgb(0 0 0) var(--color-primary);}", 0],
  ["color uppercase old limit", "orb/no-raw-color-in-css", ".x{color:RGB(0 0 0);}", 0],
  ["color quoted tokens cannot manufacture a function", "orb/no-raw-color-in-css", '.x{content:r"prose"gb(0 0 0);}', 0],
  ["color quoted tokens cannot manufacture hex", "orb/no-raw-color-in-css", '.x{content:#f"prose"ff;}', 0],
  ["rest decimal px", "orb/rest-transform-grid", ".x{transform:translateX(-.5px);}", 1],
  ["rest percentage", "orb/rest-transform-grid", ".x{translate:-50% 0;}", 1],
  ["rest state", "orb/rest-transform-grid", '.x[data-open="true"]{translate:-50% 0;}', 0],
  ["rest keyframe", "orb/rest-transform-grid", "@keyframes x{to{translate:-50% 0;}}", 0],
  ["rest starting", "orb/rest-transform-grid", "@starting-style{.x{translate:-50% 0;}}", 0],
  ["rest nested media", "orb/rest-transform-grid", "@media(min-width:40rem){.x{translate:-50% 0;}}", 1],
  ["rest native immediate owner", "orb/rest-transform-grid", '.x[data-open="true"]{@media(min-width:40rem){translate:-50% 0;}}', 1],
  ["rest non-pixel scale old limit", "orb/rest-transform-grid", ".x{scale:.95;transform:scale(.95);}", 0],
  ["rest comment", "orb/rest-transform-grid", ".x{translate:0 /* -50% */ 0;}", 0],
  ["rest var fallback old scope", "orb/rest-transform-grid", ".x{translate:var(--x,50%);}", 1],
  ["integer direct", "declaration-property-value-allowed-list", ".x{line-height:var(--leading-label);}", 0],
  ["integer unknown", "declaration-property-value-allowed-list", ".x{line-height:var(--leading-unlicensed);}", 1],
  ["integer alias", "declaration-property-value-allowed-list", ".x{--orb-tier-row-title-leading:var(--leading-unlicensed);}", 1],
  ["integer shadow", "property-disallowed-list", ".x{--leading-custom:1.4;}", 1],
  ["integer important normalized", "declaration-property-value-allowed-list", ".x{line-height:var(--leading-label)!important;}", 0],
] as const;

for (const [name, rule, code, expected] of CASES) {
  test(`native CSS: ${name}`, async ({ repoRoot }) => {
    const result = await lint(repoRoot, code);
    const warnings = result.results.flatMap((row) => row.warnings);
    expect(warnings).toHaveLength(expected);
    expect(warnings.every((warning) => warning.rule === rule)).toBe(true);
  });
}

test("the exact generated home exempts color and leading policy, not motion or rest", async ({ repoRoot }) => {
  const source = ":root{--leading-custom:1.4;line-height:1.4;color:#ff0000;}";
  expect((await lint(repoRoot, source, "packages/ui/src/styles/theme.css")).errored).toBe(false);
  const ordinary = await lint(repoRoot, source);
  expect(ordinary.results.flatMap((row) => row.warnings)).toHaveLength(3);
  const generatedMotion = await lint(repoRoot, ".x{animation:spin 220ms ease-out;translate:50% 0;}", "packages/ui/src/styles/theme.css");
  expect(generatedMotion.results.flatMap((row) => row.warnings)).toHaveLength(3);
});

for (const [rule, licensed, legal, fresh] of [
  [
    "orb/motion-token-purity",
    ".x{animation:spin var(--motion-base) ease-in-out infinite;}",
    ".x{animation:spin var(--motion-base) linear infinite;}",
    ".fresh{transition:opacity 220ms;}",
  ],
  [
    "declaration-property-value-allowed-list",
    ".x{line-height:var(--reading-line-height);}",
    ".x{line-height:var(--leading-label);}",
    ".fresh{line-height:1.4;}",
  ],
] as const) {
  test(`native CSS permission is live, line-local and stale-sensitive: ${rule}`, async ({ repoRoot }) => {
    const directive = `/* stylelint-disable-next-line ${rule} -- This exact independent recipe is sanctioned; remove when it changes. */\n`;
    const unlicensed = await lint(repoRoot, licensed);
    expect(unlicensed.results.flatMap((row) => row.warnings)).toMatchObject([{ rule }]);
    expect((await lint(repoRoot, directive + licensed)).errored).toBe(false);
    const changedFile = await lint(repoRoot, `${directive}${licensed}\n${fresh}`);
    expect(changedFile.results.flatMap((row) => row.warnings)).toMatchObject([{ rule, line: 3 }]);
    const stale = await lint(repoRoot, directive + legal);
    expect(stale.results.flatMap((row) => row.warnings)).toMatchObject([{ rule: "--report-needless-disables", text: expect.stringContaining(rule) }]);
  });
}

test("hard rest transforms reject a native disable", async ({ repoRoot }) => {
  const result = await lint(repoRoot, "/* stylelint-disable-next-line orb/rest-transform-grid -- A hard rule cannot be waived. */\n.x{translate:50% 0;}");
  expect(result.errored).toBe(true);
  expect(result.results.flatMap((row) => row.warnings)).toMatchObject([{ rule: "reportDisables", text: expect.stringContaining("may not be disabled") }]);
});

test("paren-carrying forbidden values remain blocked by native findings", async ({ repoRoot }) => {
  for (const [code, rule] of [
    [".x{color:(#ff0000);}", "orb/no-raw-color-in-css"],
    [".x{transform:(translateX(-0.5px));}", "orb/rest-transform-grid"],
  ] as const) {
    const result = await lint(repoRoot, code);
    expect(result.errored).toBe(true);
    expect(result.results.flatMap((row) => row.warnings)).toMatchObject([{ rule }]);
  }
});

function nativeCssRoot(scratch: string, repoRoot: string): void {
  for (const path of PRODUCT_STYLESHEETS) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), ".x{color:var(--color-foreground);}\n");
  }
  writeFileSync(join(scratch, STYLELINT_CONFIG_PATH), `export {default} from ${JSON.stringify(pathToFileURL(join(repoRoot, STYLELINT_CONFIG_PATH)).href)};\n`);
}

test("the real CSS runner judges whole native inputs and refuses a fresh scoped violation", async ({ scratch, repoRoot }) => {
  nativeCssRoot(scratch, repoRoot);
  expect(await runStylelint(scratch)).toBe(0);
  const path = "packages/client/src/styles/globals.css";
  writeFileSync(join(scratch, path), ".x{transition:opacity 220ms;}\n");
  expect(await runStylelint(scratch, [path])).toBe(1);
});

for (const path of ["packages/ui/src/styles/theme.css", "packages/client/src/styles/globals.css"] as const) {
  test(`the real CSS runner refuses missing required input: ${path}`, async ({ scratch, repoRoot }) => {
    nativeCssRoot(scratch, repoRoot);
    unlinkSync(join(scratch, path));
    await expect(runStylelint(scratch)).rejects.toThrow();
  });
}

test("the real CSS runner refuses a missing config and explicit absent source", async ({ scratch, repoRoot }) => {
  nativeCssRoot(scratch, repoRoot);
  await expect(runStylelint(scratch, ["packages/ui/src/absent.css"])).rejects.toThrow();
  unlinkSync(join(scratch, STYLELINT_CONFIG_PATH));
  await expect(runStylelint(scratch)).rejects.toThrow();
});

test("native syntax errors remain tool errors, not violation verdicts", async ({ scratch, repoRoot }) => {
  nativeCssRoot(scratch, repoRoot);
  const path = "packages/client/src/styles/globals.css";
  writeFileSync(join(scratch, path), ".x{color:var(--color-foreground);\n");
  expect(await runStylelint(scratch, [path])).toBe(2);
});

test("native invalid rule configuration remains a tool error", async ({ scratch, repoRoot }) => {
  nativeCssRoot(scratch, repoRoot);
  writeFileSync(join(scratch, STYLELINT_CONFIG_PATH), 'export default {rules:{"not-a-registered-css-rule":true}};\n');
  expect(await runStylelint(scratch, ["packages/client/src/styles/globals.css"])).toBe(2);
});

test("the CSS runner rejects non-CSS paths and flags before linting", async ({ scratch, repoRoot }) => {
  nativeCssRoot(scratch, repoRoot);
  await expect(runStylelint(scratch, ["--fix"])).rejects.toThrow("product CSS paths only");
  await expect(runStylelint(scratch, ["tests/ui/probe.css"])).rejects.toThrow("product CSS paths only");
});

test("ordinary application and changed-scope scheduling retain CSS policy and deletion inputs", () => {
  const row = REGISTRY.find(({ name }) => name === "lint:stylelint");
  expect(row?.applicationArgv).toEqual(["pnpm", "lint:css"]);
  for (const [path, owed] of [
    [".", true],
    ["packages/client/src/styles/globals.css", true],
    ["packages/ui/", true],
    ["packages/ui/src/tokens/tokens.json", true],
    ["stylelint.config.js", true],
    ["tooling/src/verify/lib/stylelint-css-rules.ts", true],
    ["packages/server/src/domain/chat/index.ts", false],
    ["docs/law/integer-line-boxes.md", false],
  ] as const) {
    const selection: Selection = {
      kind: "changed",
      label: "CSS change",
      paths: [path],
      existingPaths: [],
      runtimeSubjects: [],
      eslintPaths: [],
      depcruisePaths: [],
      docsPaths: [],
      tsconfigs: [],
      ct: { mode: "skip", targets: [] },
      checkScopeArgv: ["node", "tooling/src/verify/cli.ts", "scoped"],
      gitRef: undefined,
    };
    expect(row?.scopedArgv?.(selection), path).toEqual(owed ? ["node", "tooling/src/verify/cli.ts", "stylelint"] : "skip-empty");
  }
});
