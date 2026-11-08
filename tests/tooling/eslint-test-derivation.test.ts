// Native ESLint guards that keep tests on production values: design tokens and media conditions, typed refusals, seeded
// ids, non-empty case tables, assertions over an `||` and corpus capture custody. Each has planted and passing controls.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { resolvedConfig } from "./_eslint-config.ts";

const CONFIG_LOAD_TIMEOUT = { timeout: 120_000 };

const CSS_TOKEN = "orb/no-hand-typed-css-token";
const BARE_THROW = "orb/no-bare-throw-assertion";
const UNSEEDED_ID = "orb/no-unseeded-type-id";
const FILTERED_TABLE = "orb/no-filtered-case-table";
const SPREAD_CAPTURE = "orb/no-spread-corpus-capture";
const ABSENCE = "orb/ct-negative-only-case";

const SPEC = "tests/client/features/probe/probe.ct.tsx";
const NODE_TEST = "tests/server/domain/probe/probe.int.test.ts";

async function findings(root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await resolvedConfig(new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: root }), filename);
  expect(config).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found;
}

test.for([
  ["a tooling suite's literal is its tool's input", `const value = "var(--color-primary)";`, "tests/tooling/floor/probe.test.ts", 0, ""],
  ["a matcher's second argument", `await expect(el).toHaveCSS("color", "var(--color-primary)");`, SPEC, 1, "color.primary"],
  ["a matcher's attribute value", `await expect(from).toHaveAttribute("stop-color", "var(--color-primary)");`, SPEC, 1, "color.primary"],
  ["a soft matcher's second argument", `await expect.soft(el).toHaveCSS("color", "var(--color-primary)");`, SPEC, 1, "color.primary"],
  ["a declaration", `const style = "--color-primary: red";`, SPEC, 1, "color.primary"],
  ["a declaration list", `const style = "color: blue; --color-primary: red;";`, SPEC, 1, "color.primary"],
  ["a soft assertion message", `expect.soft(value, "var(--color-primary)").toBe("red");`, SPEC, 0, ""],
  ["a declaration of a name production does not hold", `const style = "--author-knob: red";`, SPEC, 0, ""],
  ["a class string's arbitrary property", `const box = <div className="[--color-primary:red]" />;`, SPEC, 0, ""],
  ["a token name", `const value = style.getPropertyValue("--color-primary");`, SPEC, 1, `TOKENS["color.primary"].cssVar`],
  ["a token in a var read", `const style = { color: "var(--color-primary)" };`, SPEC, 1, `TOKENS["color.primary"].cssVar`],
  ["a token read with a fallback", `const style = { color: "var(--color-primary, red)" };`, SPEC, 1, "color.primary"],
  ["two tokens in one calc", `const size = "calc(var(--spacing-row) + var(--spacing-block))";`, SPEC, 2, "spacing."],
  ["a token as a style key", `const style = { "--color-primary": "red" };`, SPEC, 1, "color.primary"],
  ["a token read as a property", `expect(colors["--color-primary"]).toBe("red");`, NODE_TEST, 1, "color.primary"],
  ["a template with a token", "const style = `var(--color-primary)`;", SPEC, 1, "color.primary"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  ["a token name built from a family", "const name = `--color-${tone}`;", SPEC, 1, "--color-"],
  ["a support helper", `const value = "var(--color-primary)";`, "tests/support/browser/probe.ts", 1, "color.primary"],
  ["a hover condition", `const query = "(hover: hover)";`, SPEC, 1, `MEDIA_QUERIES["hover-capable"]`],
  ["a pointer condition in a matchMedia call", `const coarse = matchMedia("(pointer: coarse)").matches;`, SPEC, 1, `MEDIA_QUERIES["pointer-coarse"]`],
  ["a width condition", `const query = "(width <= 48rem)";`, SPEC, 1, `MEDIA_QUERIES["shell-mobile"]`],
  ["a reduced-motion condition", `const query = "(prefers-reduced-motion: reduce)";`, SPEC, 1, `MEDIA_QUERIES["motion-reduce"]`],
  ["a condition production has no entry for", `const query = "(pointer: none)";`, SPEC, 1, "no `MEDIA_QUERIES` entry"],
  ["the token read", `const style = { color: \`var(\${TOKENS["color.primary"].cssVar})\` };`, SPEC, 0, ""],
  ["the media read", `const coarse = matchMedia(MEDIA_QUERIES["pointer-coarse"]).matches;`, SPEC, 0, ""],
  ["a CLI flag", `const argv = ["--json", "--color", "--spacing", "--text"];`, NODE_TEST, 0, ""],
  ["a misspelt name a warning case feeds in", `const out = warnings("--color-primry");`, NODE_TEST, 0, ""],
  ["a name production does not hold", `const style = { "--author-knob": "1" };`, SPEC, 0, ""],
  ["stylesheet text a parser takes as input", `const css = ":root { --color-primary: red; color: var(--color-primary); }";`, NODE_TEST, 0, ""],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  ["stylesheet text in a template", "const css = `.a { color: ${tone}; background: var(--color-primary); }`;", NODE_TEST, 0, ""],
  ["a media block a parser takes as input", `const css = "@media (hover: hover) { .a { color: red; } }";`, NODE_TEST, 0, ""],
  ["a token reference placeholder", `const query = "(width <= {dimension.gap})";`, NODE_TEST, 0, ""],
  ["a Tailwind class the scanner reads", `const box = <div className="h-(--size-control-sm) w-[calc(var(--spacing-row)+1px)]" />;`, SPEC, 0, ""],
  ["a case title", `test("var(--color-primary) stays readable", () => {});`, SPEC, 0, ""],
  ["an assertion message", `expect(value, "var(--color-primary)").toBe("red");`, SPEC, 0, ""],
  ["a literal type", `type Name = "--color-primary";`, SPEC, 0, ""],
  ["prose that mentions a condition's words", `const note = "pointer: coarse hover";`, SPEC, 0, ""],
] as const)("css token derivation: %s", CONFIG_LOAD_TIMEOUT, async ([, source, path, count, owner], { repoRoot }) => {
  const found = await findings(repoRoot, CSS_TOKEN, source, path);
  expect(found).toHaveLength(count);
  expect(found[0]?.message ?? "").toContain(owner);
});

test.for([
  ["a bare toThrow", "expect(() => run()).toThrow();", 1],
  ["a bare toThrowError", "expect(() => run()).toThrowError();", 1],
  ["toThrow of Error", "expect(() => run()).toThrow(Error);", 1],
  ["a bare rejection", "await expect(run()).rejects.toThrow();", 1],
  ["a rejection of Error", "await expect(run()).rejects.toThrow(Error);", 1],
  ["toThrow of undefined", "expect(() => run()).toThrow(undefined);", 1],
  ["a soft refusal", "expect.soft(() => run()).toThrow();", 1],
  ["a message beside the subject", `expect(() => run(), "why").toThrow();`, 1],
  ["an optional call", "expect(() => run()).toThrow?.();", 1],
  ["an optional rejects", "await expect(run()).rejects?.toThrow();", 1],
  ["a bracket read", `expect(() => run())["toThrow"]();`, 1],
  ["a bracket rejects", `await expect(run())["rejects"]["toThrow"]();`, 1],
  ["an empty message", `expect(() => run()).toThrow("");`, 1],
  ["an empty template", "expect(() => run()).toThrow(``);", 1],
  ["a match-all pattern", "expect(() => run()).toThrow(/./);", 1],
  ["a match-all pattern with a flag", "await expect(run()).rejects.toThrow(/.*/u);", 1],
  ["anything", "expect(() => run()).toThrow(expect.anything());", 1],
  ["any error", "await expect(run()).rejects.toThrow(expect.any(Error));", 1],
  ["any coded refusal", "await expect(run()).rejects.toThrow(expect.any(DomainOperationError));", 1],
  ["the coded refusal base", "await expect(run()).rejects.toThrow(DomainOperationError);", 1],
  ["a rejection of the coded refusal base", "await expect(run()).rejects.toBeInstanceOf(DomainOperationError);", 1],
  ["a rejected instance of Error", "await expect(run()).rejects.toBeInstanceOf(Error);", 1],
  ["a defined rejection", "await expect(run()).rejects.toBeDefined();", 1],
  ["a truthy rejection", "await expect(run()).rejects.toBeTruthy();", 1],
  ["any error in a matched object", `expect(outcome).toMatchObject({ status: "rejected", reason: expect.any(Error) });`, 1],
  ["a coded rejection", `await expect(run()).rejects.toMatchObject({ code: "asset_too_large" });`, 0],
  ["a rejected subclass", "await expect(run()).rejects.toBeInstanceOf(RangeError);", 0],
  ["a defined value that is not a rejection", "expect(value).toBeDefined();", 0],
  ["an instance that is not a rejection", "expect(value).toBeInstanceOf(Error);", 0],
  ["any string", "expect(value).toEqual(expect.any(String));", 0],
  ["a production class", "expect(() => run()).toThrow(RangeError);", 0],
  ["a rejected production class", "await expect(run()).rejects.toThrow(ProviderError);", 0],
  ["a message pattern", "expect(() => run()).toThrow(/refused/u);", 0],
  ["a message", `await expect(run()).rejects.toThrow("refused");`, 0],
  ["a code matcher", `expect(() => run()).toThrow(expect.objectContaining({ code: "ENOENT" }));`, 0],
  ["the tRPC matcher", `await expect(run()).toThrowTRPCError("NOT_FOUND");`, 0],
  ["a rejected code", `await expect(run()).rejects.toMatchObject({ code: "NOT_FOUND" });`, 0],
  ["a negated assertion", "expect(() => run()).not.toThrow();", 0],
  ["a negated rejection", "await expect(run()).rejects.not.toThrow();", 0],
  ["a helper that already asserts the class", "assertRefused(() => run()).toThrow();", 0],
  ["a helper method of the same name", "await harness.toThrow();", 0],
] as const)("bare refusal derivation: %s", CONFIG_LOAD_TIMEOUT, async ([, source, count], { repoRoot }) => {
  expect(await findings(repoRoot, BARE_THROW, source, NODE_TEST)).toHaveLength(count);
});

test("a bare refusal is a finding in a tooling suite too", CONFIG_LOAD_TIMEOUT, async ({ repoRoot }) => {
  expect(await findings(repoRoot, BARE_THROW, "expect(() => run()).toThrow();", "tests/tooling/floor/probe.test.ts")).toHaveLength(1);
});

test.for([
  ["a one-argument mint", "const id = mintTypeId(ID_PREFIX.chat);", NODE_TEST, 1],
  ["a literal prefix", `const id = mintTypeId("chat");`, NODE_TEST, 1],
  ["an optional call", "const id = mintTypeId?.(ID_PREFIX.chat);", NODE_TEST, 1],
  ["a member call", "const id = kit.mintTypeId(ID_PREFIX.chat);", NODE_TEST, 1],
  ["a bracket call", `const id = kit["mintTypeId"](ID_PREFIX.chat);`, NODE_TEST, 1],
  ["an undefined generator", "const id = mintTypeId(ID_PREFIX.chat, undefined);", NODE_TEST, 1],
  ["a story", "const CHAT_ID = mintTypeId(ID_PREFIX.chat);", "tests/client/features/probe/_probe-stories.tsx", 1],
  ["a factory", "const id = mintTypeId(ID_PREFIX.chat);", "tests/support/node/factories/probe.ts", 1],
  ["a type contract, which runs nothing", "expectTypeOf(mintTypeId(ID_PREFIX.chat)).toEqualTypeOf<ChatId>();", "tests/kit/ids/probe.test-d.ts", 0],
  ["a seeded generator", "const id = mintTypeId(ID_PREFIX.chat, ids.next);", NODE_TEST, 0],
  ["the fixture's typed id", "const id = ids.typeId(ID_PREFIX.chat);", NODE_TEST, 0],
] as const)("unseeded id derivation: %s", CONFIG_LOAD_TIMEOUT, async ([, source, path, count], { repoRoot }) => {
  expect(await findings(repoRoot, UNSEEDED_ID, source, path)).toHaveLength(count);
});

test.for([
  ["test.for over a filter", `test.for(NAMES.filter(keep))("%s", () => {});`, 1],
  ["test.each over a filter", `test.each(NAMES.filter(keep))("%s", () => {});`, 1],
  ["it.for over a filter", `it.for(NAMES.filter(keep))("%s", () => {});`, 1],
  ["describe.each over a filter", `describe.each(NAMES.filter(keep))("%s", () => {});`, 1],
  ["a modifier in the chain", `test.concurrent.for(NAMES.filter(keep))("%s", () => {});`, 1],
  ["a map after the filter", `test.for(NAMES.filter(keep).map(shape))("%s", () => {});`, 1],
  ["a cast table", `test.for(NAMES.filter(keep) as readonly string[])("%s", () => {});`, 1],
  ["a const that holds the filter", `const ROWS = NAMES.filter(keep);\ntest.for(ROWS)("%s", () => {});`, 1],
  ["a for loop over a filter that registers", "for (const name of NAMES.filter(keep)) {\n  test(name, () => {});\n}", 1],
  ["a for loop over a held filter", "const ROWS = NAMES.filter(keep);\nfor (const name of ROWS) {\n  test.describe(name, () => {});\n}", 1],
  ["a nested for loop over a filter", "for (const name of NAMES.filter(keep)) {\n  if (name) {\n    it(name, () => {});\n  }\n}", 1],
  ["a for loop with no filter", "for (const name of NAMES) {\n  test(name, () => {});\n}", 0],
  ["a loop inside a case asserts", `test("probe", () => {\n  for (const name of NAMES.filter(keep)) {\n    expect(name).toBe("a");\n  }\n});`, 0],
  ["a filtered loop of steps", "for (const name of NAMES.filter(keep)) {\n  test.step(name, () => {});\n}", 0],
  ["forEachNonEmpty over a filter", `forEachNonEmpty(NAMES.filter(keep), "names", (name) => { test(name, () => {}); });`, 0],
  ["a table with no filter", `test.for(NAMES.map(shape))("%s", () => {});`, 0],
  ["a filter inside a row", `test.for([NAMES.filter(keep)])("%s", () => {});`, 0],
  ["a filter on another helper's for", "harness.for(NAMES.filter(keep));", 0],
] as const)("filtered table derivation: %s", CONFIG_LOAD_TIMEOUT, async ([, source, count], { repoRoot }) => {
  expect(await findings(repoRoot, FILTERED_TABLE, source, NODE_TEST)).toHaveLength(count);
});

test.for([
  ["a spread of a path read", `const row = { ...corpus.reads["chat.getChat"] };`, 1],
  ["a spread of a capture in a list", `const row = { ...corpus.reads["chat.getChat"][0], viewerUserId };`, 1],
  ["a spread of a named read", "const row = { ...active.reads.quickPicks, input };", 1],
  ["an optional read", "const row = { ...wire.shellAmbient?.reads.quickPicks };", 1],
  ["a const that holds the capture", `const capture = corpus.reads["chat.getChat"][0];\nconst row = { ...capture, input };`, 1],
  ["a served procedure", `const routes = serveCorpusProcedures(root.caller, ["chat.getChat"]);`, 0],
  ["a route map spread whole", "const routes = { ...room.reads, ...served };", 0],
  ["the input of a capture", "const body = { ...active.reads.state.input, actionId };", 0],
  ["an unrelated spread", "const row = { ...corpus.settings };", 0],
  ["a list of captures", `const rows = [...corpus.reads["chat.getChat"]];`, 0],
  ["a read of one field", `const output = corpus.reads["chat.getChat"][0].output;`, 0],
] as const)("spread capture derivation: %s", CONFIG_LOAD_TIMEOUT, async ([, source, count], { repoRoot }) => {
  expect(await findings(repoRoot, SPREAD_CAPTURE, source, NODE_TEST)).toHaveLength(count);
});

test("the capture custody suite may spread a capture to prove it refused", CONFIG_LOAD_TIMEOUT, async ({ repoRoot }) => {
  const source = "const capture = wire.reads.quickPicks;\nconst forged = { ...capture };";
  expect(await findings(repoRoot, SPREAD_CAPTURE, source, "tests/support/node/corpus-read-responder.int.test.ts")).toHaveLength(0);
});

const caseOf = (body: string): string => `test("probe", async ({ page }) => {\n${body}\n});`;

test.for([
  ["an or in toBe(true)", caseOf("expect(a || b).toBe(true);\nawait expect(c).toBeVisible();"), 1],
  ["an or with a message", caseOf(`expect(a || b, "why").toBe(true);\nawait expect(c).toBeVisible();`), 1],
  ["an or in toBeTruthy", caseOf("expect(a || b).toBeTruthy();\nawait expect(c).toBeVisible();"), 1],
  ["an or in toEqual(true)", caseOf("expect(a || b).toEqual(true);\nawait expect(c).toBeVisible();"), 1],
  ["an or under an and", caseOf("expect(a && (b || c)).toBe(true);\nawait expect(c).toBeVisible();"), 1],
  ["a soft or", caseOf("expect.soft(a || b).toBe(true);\nawait expect(c).toBeVisible();"), 1],
  ["an and", caseOf("expect(a && b).toBe(true);"), 0],
  ["a nullish default", caseOf("expect(a ?? b).toBe(true);"), 0],
  ["an or in toBe(false)", caseOf("expect(a || b).toBe(false);"), 0],
  ["a negated truth", caseOf("expect(a || b).not.toBe(true);"), 0],
  ["a set of outcomes", caseOf(`expect(["gone", "zombie"]).toContain(kind);`), 0],
] as const)("vacuous or derivation: %s", CONFIG_LOAD_TIMEOUT, async ([, source, count], { repoRoot }) => {
  expect(await findings(repoRoot, ABSENCE, source, SPEC)).toHaveLength(count);
});

test("outside the CT and e2e layers the rule judges the or alone", CONFIG_LOAD_TIMEOUT, async ({ repoRoot }) => {
  expect(await findings(repoRoot, ABSENCE, caseOf("expect(a || b).toBe(true);\nexpect(c).toBe(2);"), NODE_TEST)).toHaveLength(1);
  expect(await findings(repoRoot, ABSENCE, caseOf("expect(lookup()).toBeNull();"), NODE_TEST)).toHaveLength(0);
  expect(await findings(repoRoot, ABSENCE, caseOf("expect(lookup()).toBeNull();"), SPEC)).toHaveLength(1);
});
