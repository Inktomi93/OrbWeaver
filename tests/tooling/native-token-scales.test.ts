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
].flatMap((candidate) => [candidate, `hover:${candidate}`, `focus:${candidate}`, `[&:hover]:${candidate}`, `!${candidate}`, `${candidate}!`]);
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
  const withoutResets = themeCss.replace("  --radius-*: initial;\n  --shadow-*: initial;\n", "");
  const baseline = await __unstable__loadDesignSystem(`${stock}\n${withoutResets}`);

  expect(current.candidatesToCss(OFF_TOKEN).map((css) => css !== null)).toEqual(OFF_TOKEN.map(() => false));
  const supported = current.candidatesToCss(SUPPORTED);
  expect(supported.every((css) => css !== null)).toBe(true);
  expect(supported).toEqual(baseline.candidatesToCss(SUPPORTED));
  // shadow-3xl is already absent from the installed stock theme, unlike the reset-dependent candidates.
  const stockCandidates = OFF_TOKEN.filter((candidate) => candidate !== "shadow-3xl");
  expect(baseline.candidatesToCss(stockCandidates).every((css) => css !== null)).toBe(true);
});

test("effective UI/client native rules reject stock classes in real class carriers, not copy or unrelated attributes", async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  for (const [path, entryPoint, authoredClass] of [
    ["packages/ui/src/primitives/native-token-control.tsx", "packages/ui/src/styles/globals.css", UI_AUTHORED_CLASS],
    ["packages/ui/src/primitives/native-token-control.ts", "packages/ui/src/styles/globals.css", UI_AUTHORED_CLASS],
    ["packages/client/src/features/native-token-control.tsx", "packages/client/src/styles/globals.css", CLIENT_AUTHORED_CLASS],
    ["packages/client/src/features/native-token-control.ts", "packages/client/src/styles/globals.css", CLIENT_AUTHORED_CLASS],
  ] as const) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    expect(config.rules[RULE]?.[0], path).toBe(2);
    expect(config.settings["better-tailwindcss"]).toEqual({ entryPoint: join(repoRoot, entryPoint) });
    const plugin = config.plugins["better-tailwindcss"];
    expect(plugin).toBeDefined();
    const linter = new Linter();
    // Isolate the effective syntax-only rule; these virtual sources intentionally have no typed program or domain wiring.
    const lint = (source: string): readonly string[] => {
      const messages = linter.verify(
        source,
        {
          files: ["**/*.{ts,tsx}"],
          languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
          plugins: plugin === undefined ? {} : { "better-tailwindcss": plugin },
          settings: config.settings,
          rules: { [RULE]: config.rules[RULE] ?? "off" },
        },
        { filename: path },
      );
      expect(
        messages.filter(({ fatal }) => fatal),
        source,
      ).toEqual([]);
      expect(
        messages.every(({ ruleId }) => ruleId === RULE),
        source,
      ).toBe(true);
      return messages.map(({ message }) => message);
    };
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
