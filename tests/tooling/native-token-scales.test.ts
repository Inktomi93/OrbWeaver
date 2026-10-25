// Native Tailwind compilation owns the closed radius/shadow vocabulary; effective ESLint owns its class carriers.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { TOKEN_ARTIFACT_PATHS } from "@orb/ui/token-contract";
import { TOKENS } from "@orb/ui/tokens";
import { generateArtifacts } from "@orb/ui/tokens-build";
import { ESLint, Linter } from "eslint";
import { __unstable__loadDesignSystem } from "tailwindcss";
import tseslint from "typescript-eslint";

const RULE = "better-tailwindcss/no-unknown-classes";
const RESTRICTED_RULE = "better-tailwindcss/no-restricted-classes";
const LOGICAL_RULE = "better-tailwindcss/enforce-logical-properties";
/** The physical class each logical-properties message names, in report order. */
function physicalIn(messages: readonly string[]): readonly string[] {
  return messages.map((message) => /Replace "([^"]+)"/u.exec(message)?.[1] ?? message);
}
// Classes the compiler still accepts after the resets: stock line-heights, bare namespace forms and arbitrary design numbers.
const RESTRICTED = [
  "leading-tight",
  "leading-6",
  "size-control-sm",
  "h-scroll-md",
  "max-h-scroll-lg",
  "w-lane",
  "grid-cols-[1.55fr_1fr]",
  "max-h-[60cqh]",
  "@cq-28:h-[8.5rem]",
];
const STRUCTURAL_ARBITRARY = "h-(--height-scroll-md) grid-cols-[auto_minmax(0,1fr)] grid-cols-[repeat(auto-fill,var(--width-cell-fixed))] flex-2 max-h-1/2";
const UI_AUTHORED_CLASS = "orb-weave-glow";
const CLIENT_AUTHORED_CLASS = "shell-panel";
const OFF_TOKEN = [
  "rounded-xs",
  "rounded-sm",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "rounded-2xl",
  "rounded-3xl",
  "rounded-4xl",
  "shadow",
  "shadow-2xs",
  "shadow-xs",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "shadow-2xl",
  "shadow-3xl",
  "shadow-inner",
  "hover:shadow-lg",
  "focus:rounded-lg",
  "[&:hover]:shadow-md",
  "md:flex",
  "max-md:hidden",
  "lg:grid",
  "p-4",
  "max-h-96",
  "size-19",
  "gap-2",
  "text-sm",
  "text-base",
  "tracking-wide",
  "max-w-sm",
  "@md:flex",
  "@max-lg:hidden",
];
const CONDITION_VARIANTS = [
  "shell-mobile:hidden",
  "shell-desktop:flex",
  "shell-narrow:flex",
  "pointer-coarse:flex",
  "transparency-reduce:hidden",
  "@cq-28:flex",
  "@max-cq-32:hidden",
];
const SUPPORTED = [
  ...Object.keys(TOKENS)
    .filter((path) => path.startsWith("radius."))
    .map((path) => `rounded-${path.slice("radius.".length)}`),
  ...Object.keys(TOKENS)
    .filter((path) => path.startsWith("shadow."))
    .map((path) => `shadow-${path.slice("shadow.".length)}`),
  "rounded-none",
  "shadow-none",
  "drop-shadow-sm",
  "shadow-overlay/50",
  "bg-primary",
  "gap-row",
  "p-0",
  "inset-0",
  "min-w-0",
  "w-px",
  "font-medium",
  "tracking-normal",
  "leading-body",
  "text-label",
  "max-w-cq-24",
].flatMap((candidate) => [candidate, `hover:${candidate}`, `focus:${candidate}`, `[&:hover]:${candidate}`]);
/** The important modifier, in both spellings and under a variant, is refused on an otherwise supported class. */
const IMPORTANT = ["!p-0", "p-0!", "hover:!p-0", "hover:p-0!"];
/** One control per class gate that moved from an `orb/` rule onto a restricted pattern. */
const RETIRED_GATE_CONTROLS = ["pt-[13px]", "@min-[100rem]:flex", "p-(--primitive-space-8)", "bg-black", "text-red-500", "bg-[#fff]", "max-w-prose"];
/** Class strings in UPPER_CASE constants and their object values: one hit per retired gate, plus the pointer variant in features. */
const PLANTED_CONSTANTS = [
  'export const PLANT_COLOR = "bg-red-500 text-white";',
  'export const PLANT_ARBITRARY = "p-[13px] w-[300px]";',
  'export const PLANT_VIEWPORT = "md:flex";',
  'export const PLANT_PROSE = "max-w-prose";',
  'export const PLANT_POINTER = "pointer-coarse:flex";',
  'export const RAIL = { root: "bg-[#ff0000]" };',
].join("\n");
const PLANTED_CONSTANT_HITS = 7;
/** Class strings in lowercase bindings, an object map and function returns, which the plugin's default selectors skip. */
const PLANTED_BINDINGS = [
  'const weldRounding = flag ? "rounded-l-none bg-red-500" : "w-[300px]";',
  'export const toneClasses = { warn: "bg-red-500 md:flex" };',
  'export const railClass = "border-l-2 max-w-prose";',
  'export function cellWidthClass(c: boolean): string { return c ? "bg-[#ff0000]" : "p-[13px]"; }',
  'export const rowClass = (c: boolean): string => (c ? "pl-row" : "bg-red-500");',
  'export const SHOUT_CASE = "pointer-coarse:flex bg-red-500";',
].join("\n");
const PLANTED_BINDING_RESTRICTED = 9;
const PLANTED_BINDING_PHYSICAL = ["rounded-l-none", "w-[300px]", "border-l-2", "pl-row"];
/** A `cn()` on the left of `??` or the right of `&&` is a class value, not a test. */
const PLANTED_CALL_IN_LOGICAL = 'export const shown = cn("h-auto", flag ? "mt-row" : "") ?? "";\nexport const gated = flag && cn("pl-row");';
const PLANTED_CALL_IN_LOGICAL_PHYSICAL = ["h-auto", "mt-row", "pl-row"];
/** A viewport variant, a pointer variant, a raw width step and an arbitrary width. */
const SCOPED_CONTROLS = ["md:flex", "pointer-coarse:flex", "w-64", "w-[20rem]"];
// biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
const SPLICED_CLASS = "cn(`text-${size}`);";
const CARRIERS = [
  '<div className="CLASS" />;',
  '<div className={"CLASS"} />;',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  "<div className={`CLASS ${dynamic} CLASS ${other} CLASS`} />;",
  'cn("CLASS");',
  'cn(["CLASS"], { "CLASS": enabled });',
  'clsx("CLASS", ["CLASS"], { "CLASS": enabled });',
  'cva("CLASS", { variants: { size: { large: "CLASS" } }, compoundVariants: [{ size: "large", class: "CLASS" }] });',
  'tv({ base: "CLASS", slots: { card: "CLASS" }, variants: { size: { large: "CLASS" } }, compoundVariants: [{ size: "large", class: "CLASS" }], compoundSlots: [{ slots: ["card"], class: "CLASS" }] });',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  "tv({ base: `CLASS ${dynamic} CLASS ${other} CLASS` });",
];

test("generated namespace resets reject stock scales without changing supported candidate CSS or unrelated namespaces", async ({ repoRoot }) => {
  const { themeCss, tokensTs, themesTs } = await generateArtifacts();
  for (const [bytes, target] of [
    [themeCss, TOKEN_ARTIFACT_PATHS.themeCss],
    [tokensTs, TOKEN_ARTIFACT_PATHS.tokensTs],
    [themesTs, TOKEN_ARTIFACT_PATHS.themesTs],
  ] as const) {
    expect(readFileSync(join(repoRoot, "packages/ui", target), "utf8")).toBe(bytes);
  }
  const require = createRequire(join(repoRoot, "package.json"));
  const stock = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8");
  const current = await __unstable__loadDesignSystem(`${stock}\n${themeCss}`);
  const withoutResets = themeCss.replace(/^ {2}--[a-z-]+-\*: initial;\n/gmu, "");
  const baseline = await __unstable__loadDesignSystem(`${stock}\n${withoutResets}`);

  expect(current.candidatesToCss(OFF_TOKEN).map((css) => css !== null)).toEqual(OFF_TOKEN.map(() => false));
  // The named conditions compile as variants where the stock breakpoints no longer do.
  expect(current.candidatesToCss(CONDITION_VARIANTS).every((css) => css !== null)).toBe(true);
  const supported = current.candidatesToCss(SUPPORTED);
  expect(supported.every((css) => css !== null)).toBe(true);
  expect(supported).toEqual(baseline.candidatesToCss(SUPPORTED));
  // shadow-3xl is already absent from the installed stock theme, unlike the reset-dependent candidates.
  const stockCandidates = OFF_TOKEN.filter((candidate) => candidate !== "shadow-3xl");
  expect(baseline.candidatesToCss(stockCandidates).every((css) => css !== null)).toBe(true);
});

test("effective UI/client native rules reject stock classes in real class carriers, not copy or unrelated attributes", async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  for (const [path, entryPoint, authoredClass, pointerRefusals] of [
    ["packages/ui/src/primitives/native-token-control.tsx", "packages/ui/src/styles/globals.css", UI_AUTHORED_CLASS, 0],
    ["packages/ui/src/primitives/native-token-control.ts", "packages/ui/src/styles/globals.css", UI_AUTHORED_CLASS, 0],
    ["packages/client/src/features/native-token-control.tsx", "packages/client/src/styles/globals.css", CLIENT_AUTHORED_CLASS, 1],
    ["packages/client/src/features/native-token-control.ts", "packages/client/src/styles/globals.css", CLIENT_AUTHORED_CLASS, 1],
  ] as const) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    expect(config.rules[RULE]?.[0], path).toBe(2);
    expect(config.settings["better-tailwindcss"]).toEqual({ entryPoint: join(repoRoot, entryPoint) });
    const plugin = config.plugins["better-tailwindcss"];
    expect(plugin).toBeDefined();
    const linter = new Linter();
    // Isolate the effective syntax-only rule; these virtual sources intentionally have no typed program or domain wiring.
    const lintWith = (rule: string, source: string): readonly string[] => {
      const messages = linter.verify(
        source,
        {
          files: ["**/*.{ts,tsx}"],
          languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
          plugins: plugin === undefined ? {} : { "better-tailwindcss": plugin },
          settings: config.settings,
          rules: { [rule]: config.rules[rule] ?? "off" },
        },
        { filename: path },
      );
      expect(
        messages.filter(({ fatal }) => fatal),
        source,
      ).toEqual([]);
      expect(
        messages.every(({ ruleId }) => ruleId === rule),
        source,
      ).toBe(true);
      return messages.map(({ message }) => message);
    };
    const lint = (source: string): readonly string[] => lintWith(RULE, source);
    expect(config.rules[RESTRICTED_RULE]?.[0], path).toBe(2);
    expect(RESTRICTED.map((candidate) => lintWith(RESTRICTED_RULE, `cn("${candidate}");`).length)).toEqual(RESTRICTED.map(() => 1));
    expect(lintWith(RESTRICTED_RULE, `cn("${STRUCTURAL_ARBITRARY}");`)).toEqual([]);
    expect(IMPORTANT.map((candidate) => lintWith(RESTRICTED_RULE, `cn("${candidate}");`).length)).toEqual(IMPORTANT.map(() => 1));
    expect(RETIRED_GATE_CONTROLS.map((candidate) => lintWith(RESTRICTED_RULE, `cn("${candidate}");`).length)).toEqual(RETIRED_GATE_CONTROLS.map(() => 1));
    // The retired gates read every string literal; the patterns reach exported constants and their object values too.
    expect(lintWith(RESTRICTED_RULE, PLANTED_CONSTANTS), path).toHaveLength(PLANTED_CONSTANT_HITS + pointerRefusals);
    expect(lintWith(RESTRICTED_RULE, PLANTED_BINDINGS), path).toHaveLength(PLANTED_BINDING_RESTRICTED + pointerRefusals);
    expect(physicalIn(lintWith(LOGICAL_RULE, PLANTED_BINDINGS)), path).toEqual(PLANTED_BINDING_PHYSICAL);
    expect(physicalIn(lintWith(LOGICAL_RULE, PLANTED_CALL_IN_LOGICAL)), path).toEqual(PLANTED_CALL_IN_LOGICAL_PHYSICAL);
    // The scoped patterns: viewport variants and raw widths everywhere outside the shell, pointer variants in features only.
    expect(
      SCOPED_CONTROLS.map((candidate) => lintWith(RESTRICTED_RULE, `cn("${candidate}");`).length),
      path,
    ).toEqual([1, pointerRefusals, 1, 1]);
    expect(lintWith("better-tailwindcss/no-concatenated-classes", SPLICED_CLASS), path).toHaveLength(1);
    for (const carrier of CARRIERS) {
      if (path.endsWith(".ts") && carrier.startsWith("<")) {
        continue;
      }
      for (const candidate of OFF_TOKEN) {
        const source = carrier.replaceAll("CLASS", candidate);
        const messages = lint(source);
        expect(messages, `${path}: ${source}`).toHaveLength(carrier.split("CLASS").length - 1);
        expect(
          messages.every((message) => message.includes(candidate)),
          source,
        ).toBe(true);
      }
      expect(lint(carrier.replaceAll("CLASS", SUPPORTED.join(" "))), carrier).toEqual([]);
    }
    expect(lint(`cn("${authoredClass}");`)).toEqual([]);
    for (const candidate of ["orb-nonexistent", "shell-nonexistent", "orb-weave-glow-typo", "shell-panel-typo"]) {
      expect(lint(`cn("${candidate}");`)).toEqual([`Unknown class detected: ${candidate}`]);
    }
    expect(lint('const label = "Prose shadow"; describe("rounded-lg card corners");')).toEqual([]);
    const nonClassAttribute = path.endsWith(".tsx") ? '<div title="rounded-lg" />;' : 'const title = "rounded-lg";';
    expect(lint(nonClassAttribute)).toEqual([]);
    expect(lint('tv({ base: "rounded-card", defaultVariants: { size: "shadow" } });')).toEqual([]);
  }
});
