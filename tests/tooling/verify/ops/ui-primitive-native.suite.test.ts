// The UI primitive structure walls run as native lint rules: the ordinary profile owns the variants-barrel and inline-SVG
// bans; the HARD profile owns CT color, CT inline providers and overlay anatomy and takes no inline exception.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scaledBudget } from "../../_load-budget.ts";

const BARREL = "orb/ui-variants-barrel-private";
const SVG = "orb/ui-no-inline-svg";
const COLOR = "orb/ui-ct-no-color-literal";
const PROVIDER = "orb/ui-ct-no-inline-provider";
const ANCHORED = "orb/ui-overlay-anchored-anatomy";
const MODAL = "orb/ui-overlay-modal-anatomy";

const INDEX = "packages/ui/src/primitives/thing/index.ts";
const COMPONENT = "packages/ui/src/primitives/thing/thing.tsx";
const CT = "tests/ui/primitives/thing/thing.ct.tsx";
const FIXTURES = "tests/ui/primitives/thing/thing.fixtures.tsx";
const POPOVER = "packages/ui/src/primitives/popover/popover.tsx";
const DIALOG = "packages/ui/src/primitives/dialog/dialog.tsx";

async function ordinary(root: string, rule: string, path: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await new ESLint({ cwd: root }).calculateConfigForFile(filename);
  expect(config, path).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

async function hard(root: string, rule: string, path: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, "eslint-hard.config.js"), allowInlineConfig: false });
  const [result] = await eslint.lintText(source, { filePath: join(root, path) });
  expect(result?.fatalErrorCount, path).toBe(0);
  return (result?.messages ?? []).filter(({ ruleId }) => ruleId === rule);
}

const CHART_SVG = "export const Thing = () => <svg />;";
const ordinaryCases: readonly (readonly [name: string, rule: string, path: string, source: string, count: number])[] = [
  ["barrel star re-export of variants", BARREL, INDEX, 'export * from "./variants";', 1],
  ["barrel named re-export of variants", BARREL, INDEX, 'export { thingVariants } from "./variants";', 1],
  ["barrel type re-export of variants", BARREL, INDEX, 'export type { ThingVariantProps } from "./variants";', 1],
  ["barrel namespace re-export of variants", BARREL, INDEX, 'export * as variants from "./variants";', 1],
  ["barrel parent-relative variants", BARREL, INDEX, 'export * from "../other/variants";', 1],
  ["barrel bare variants specifier", BARREL, INDEX, 'export * from "variants";', 1],
  ["barrel at the package root", BARREL, "packages/ui/src/index.ts", 'export * from "./variants";', 1],
  ["barrel import of variants is internal use", BARREL, INDEX, 'import { thingVariants } from "./variants";export const x = thingVariants;', 0],
  ["barrel local export carries no specifier", BARREL, INDEX, "const a = 1;export { a };", 0],
  ["barrel similar specifier", BARREL, INDEX, 'export * from "./variants-helper";', 0],
  ["barrel component re-export", BARREL, INDEX, 'export { Thing } from "./thing";', 0],
  ["barrel rule is for index.ts only", BARREL, "packages/ui/src/primitives/thing/thing.ts", 'export * from "./variants";', 0],
  ["barrel rule stays inside packages/ui", BARREL, "packages/client/src/features/index.ts", 'export * from "./variants";', 0],
  [
    "barrel reasoned inline exception suppresses exactly that finding",
    BARREL,
    INDEX,
    '// eslint-disable-next-line orb/ui-variants-barrel-private -- reviewed pending migration.\nexport * from "./variants";',
    0,
  ],
  [
    "barrel inline exception does not excuse the next line",
    BARREL,
    INDEX,
    '// eslint-disable-next-line orb/ui-variants-barrel-private -- reviewed pending migration.\nexport * from "./variants";\nexport * from "./variants";',
    1,
  ],
  ["svg self-closing", SVG, COMPONENT, CHART_SVG, 1],
  ["svg with children reports its opening element once", SVG, COMPONENT, "export const Thing = () => <svg><path /></svg>;", 1],
  ["svg two elements two findings", SVG, COMPONENT, "export const Thing = () => <><svg /><svg /></>;", 2],
  ["svg chart layer", SVG, "packages/ui/src/charts/thing.tsx", CHART_SVG, 0],
  ["svg nested chart directory", SVG, "packages/ui/src/primitives/charts/thing.tsx", CHART_SVG, 0],
  ["svg chart-lookalike directory stays in scope", SVG, "packages/ui/src/primitives/chartsy/thing.tsx", CHART_SVG, 1],
  ["svg member tag is not the intrinsic", SVG, COMPONENT, "export const Thing = () => <Icons.svg />;", 0],
  ["svg component named Svg is not the intrinsic", SVG, COMPONENT, "export const Thing = () => <Svg />;", 0],
  ["svg child element g is not svg", SVG, COMPONENT, "export const Thing = () => <g />;", 0],
  ["svg outside the UI package", SVG, "packages/client/src/features/thing.tsx", CHART_SVG, 0],
  [
    "svg reasoned inline exception suppresses exactly that finding",
    SVG,
    COMPONENT,
    "// eslint-disable-next-line orb/ui-no-inline-svg -- reviewed pending migration.\nexport const Thing = () => <svg />;",
    0,
  ],
];

// The first case pays the one-time load of the whole repository ESLint config.
const CONFIG_LOAD_BUDGET_MS = scaledBudget(60_000);

test.for(ordinaryCases)("native UI primitive ordinary rules: $0", { timeout: CONFIG_LOAD_BUDGET_MS }, async ([, rule, path, source, count], { repoRoot }) => {
  const found = await ordinary(repoRoot, rule, path, source);
  expect(found).toHaveLength(count);
  expect(found.every(({ ruleId }) => ruleId === rule)).toBe(true);
});

const OVERLAY_BASE = "export const X = () => ";
const hardCases: readonly (readonly [name: string, rule: string, path: string, source: string, count: number])[] = [
  ["color hex in a CT assertion", COLOR, CT, 'expect(el).toHaveCSS("color", "#abc");', 1],
  ["color hex eight digits", COLOR, CT, 'const c = "#aabbccdd";', 1],
  ["color hex four digits", COLOR, CT, 'const c = "#abcd";', 1],
  ["color two-digit hex is not a color", COLOR, CT, 'const c = "#ab";', 0],
  ["color oklch", COLOR, CT, 'const c = "oklch(0.5 0.1 20)";', 1],
  ["color rgb", COLOR, CT, 'const c = "rgb(1, 2, 3)";', 1],
  ["color rgba", COLOR, CT, 'const c = "rgba(1, 2, 3, 0.5)";', 1],
  ["color rgb call with numeric arguments", COLOR, CT, "export const shade = rgb(10, 20, 30);", 1],
  ["color rgba call with a fractional alpha", COLOR, CT, "export const shade = rgba(1, 2, 3, 0.5);", 1],
  ["color oklch call with numeric arguments", COLOR, CT, "export const shade = oklch(0.5, 0.1, 20);", 1],
  ["color rgb call with a negative argument", COLOR, CT, "export const shade = rgb(-1, 2, 3);", 1],
  ["color call through a member callee", COLOR, CT, "export const shade = Color.rgb(1, 2, 3);", 1],
  ["color call nested in a template substitution", COLOR, CT, "export const shade = `rgb(${rgb(1, 2, 3)})`;", 1],
  ["color call as an expect actual", COLOR, CT, 'expect(rgb(1, 2, 3), "#424 reason").toBe(1);', 1],
  ["color template call with a substitution before its digits", COLOR, CT, "export const shade = `rgb(${r}, 20, 30)`;", 1],
  ["color oklch template call with a leading substitution", COLOR, CT, "export const shade = `oklch(${l} 0.2 30)`;", 1],
  ["color template call with digits after two substitutions", COLOR, CT, "export const shade = `rgba(${r}, ${g}, ${b}, 0.5)`;", 1],
  ["color template call with a substitution after its digits", COLOR, CT, "export const shade = `rgb(10, ${g}, ${b})`;", 1],
  ["color template call of only substitutions carries no digit", COLOR, CT, "export const shade = `rgb(${r}, ${g}, ${b})`;", 0],
  ["color template call closed before its digit", COLOR, CT, "export const shade = `rgb(${r}) ${x} 5px`;", 0],
  ["color template call in a narration title chunk", COLOR, CT, "test(`rgb(${r}, 20, 30) title`, () => {});", 0],
  ["color string concatenation split by a variable", COLOR, CT, 'export const shade = "rgb(" + r + ", 20, 30)";', 1],
  ["color string concatenation through two variables", COLOR, CT, "export const shade = 'oklch(' + l + ' ' + c + ' 30)';", 1],
  ["color string concatenation of only variables carries no digit", COLOR, CT, 'export const shade = "rgb(" + r + ", " + g + ", " + b + ")";', 0],
  ["color string concatenation closed before its digit", COLOR, CT, 'export const shade = "rgb(" + r + ") " + "5px";', 0],
  ["color concatenated rgba with four digitless operands before the alpha", COLOR, CT, 'export const h = "rgba(" + r + ", " + g + ", " + b + ", 0.5)";', 1],
  ["color concatenated rgba with bare separators", COLOR, CT, 'export const h = "rgba(" + r + "," + g + "," + b + ",0.5)";', 1],
  ["color concatenation whose open literal carries a space", COLOR, CT, 'export const h = "rgb( " + r + ", 20, 30)";', 1],
  ["color joined array of operands", COLOR, CT, 'export const h = ["rgb(", r, ", 20, 30)"].join("");', 1],
  ["color template literals concatenated with a variable", COLOR, CT, "export const h = `rgb(` + r + `, 20, 30)`;", 1],
  ["color concatenation as a title argument is code", COLOR, CT, 'test("rgb(" + r + ", 20, 30)", () => {});', 1],
  [
    "color inline exception cannot excuse the HARD color ban",
    COLOR,
    CT,
    '// eslint-disable-next-line orb/ui-ct-no-color-literal -- bypass\nconst c = "#abc";',
    1,
  ],
  ["color rgb call without a digit argument", COLOR, CT, "export const shade = rgb(r, g, b);", 0],
  ["color call named argb is not a color", COLOR, CT, "export const shade = argb(1, 2, 3);", 0],
  ["color call of an unrelated function", COLOR, CT, "export const shade = lighten(1, 2);", 0],
  ["color rgb call outside a CT", COLOR, FIXTURES, "export const shade = rgb(10, 20, 30);", 0],
  ["color rgb of a variable carries no digit", COLOR, CT, 'const c = "rgb(var(--x))";', 0],
  ["color word boundary", COLOR, CT, 'const c = "argb(1)";', 0],
  ["color in a template literal", COLOR, CT, "const c = `#abc`;", 1],
  ["color in a regular expression", COLOR, CT, "const c = /#abcdef/u;", 1],
  ["color in JSX text", COLOR, CT, "export const A = () => <p>#abc</p>;", 1],
  ["color in a JSX attribute", COLOR, CT, 'export const A = () => <p style="color:#abc" />;', 1],
  ["color comment is not code", COLOR, CT, "// #abc and oklch(1 0 0)\nconst c = 1;", 0],
  ["color test title is narration", COLOR, CT, 'test("#483 the seal", () => {});', 0],
  ["color it title is narration", COLOR, CT, 'it("#483 the seal", () => {});', 0],
  ["color describe title is narration", COLOR, CT, 'describe("#483 the seal", () => {});', 0],
  ["color suite title is narration", COLOR, CT, 'suite("#483 the seal", () => {});', 0],
  ["color bench title is narration", COLOR, CT, 'bench("#483 the seal", () => {});', 0],
  ["color modifier chain keeps its root narration", COLOR, CT, 'test.describe.serial("#483 the seal", () => {});', 0],
  ["color skip modifier keeps its root narration", COLOR, CT, 'test.skip("#483 the seal", () => {});', 0],
  ["color template title chunks are narration", COLOR, CT, "test(`the #483 seal`, () => {});", 0],
  ["color template title substitution stays code", COLOR, CT, 'test(`the #483 seal ${"#abc"}`, () => {});', 1],
  ["color expect message is narration", COLOR, CT, 'expect(1, "#424 reason").toBe(1);', 0],
  ["color expect soft message is narration", COLOR, CT, 'expect.soft(1, "#424 reason").toBe(1);', 0],
  ["color expect actual is code", COLOR, CT, 'expect("#abc", "#424 reason").toBe(1);', 1],
  ["color a later test argument is not the title", COLOR, CT, 'test("title", "#abc");', 1],
  ["color computed title is not narration", COLOR, CT, 'test.each(rows)("#abc title", () => {});', 1],
  ["color rule is for ct files only", COLOR, FIXTURES, 'const c = "#abc";', 0],
  ["color suite ct suffix is a ct file", COLOR, "tests/ui/primitives/thing/thing.suite.ct.tsx", 'const c = "#abc";', 1],
  ["color rule leaves the legacy mirror alone", COLOR, "tests/legacy/ui/primitives/thing/thing.ct.tsx", 'const c = "#abc";', 0],
  ["provider tag in a CT", PROVIDER, CT, "export const A = () => <ThemeProvider />;", 1],
  ["provider tag in fixtures", PROVIDER, FIXTURES, "export const A = () => <ThemeProvider />;", 1],
  ["provider member tag", PROVIDER, CT, "export const A = () => <Ctx.Provider value={1} />;", 1],
  ["provider member tag with a prefixed name", PROVIDER, CT, "export const A = () => <Ctx.ThemeProvider value={1} />;", 1],
  ["provider element counts once", PROVIDER, CT, "export const A = () => <ThemeProvider>x</ThemeProvider>;", 1],
  ["provider two elements two findings", PROVIDER, CT, "export const A = () => <><ThemeProvider /><QueryProvider /></>;", 2],
  [
    "provider inline exception cannot excuse the HARD provider ban",
    PROVIDER,
    CT,
    "// eslint-disable-next-line orb/ui-ct-no-inline-provider -- bypass\nexport const A = () => <ThemeProvider />;",
    1,
  ],
  ["provider plural name is not a provider", PROVIDER, CT, "export const A = () => <CtProviders />;", 0],
  ["provider prefix is not a provider", PROVIDER, CT, "export const A = () => <ProviderGrid />;", 0],
  ["provider inside a plain test file", PROVIDER, "tests/ui/primitives/thing/thing.test.tsx", "export const A = () => <ThemeProvider />;", 0],
  ["provider rule leaves the legacy mirror alone", PROVIDER, "tests/legacy/ui/primitives/thing/thing.ct.tsx", "export const A = () => <ThemeProvider />;", 0],
  ["anchored popup without its positioner", ANCHORED, POPOVER, `${OVERLAY_BASE}<D.Popup />;`, 1],
  ["anchored popup inside its positioner", ANCHORED, POPOVER, `${OVERLAY_BASE}<D.Positioner><D.Popup /></D.Positioner>;`, 0],
  ["anchored member expression popup without positioner", ANCHORED, POPOVER, "export const P = Base.Popup;", 1],
  ["anchored without any popup", ANCHORED, POPOVER, `${OVERLAY_BASE}<D.Root />;`, 0],
  ["anchored positioner without popup", ANCHORED, POPOVER, `${OVERLAY_BASE}<D.Positioner />;`, 0],
  ["anchored popup text in a comment is not code", ANCHORED, POPOVER, `// uses D.Popup\n${OVERLAY_BASE}<D.Root />;`, 0],
  ["anchored menu", ANCHORED, "packages/ui/src/primitives/menu/menu.tsx", `${OVERLAY_BASE}<D.Popup />;`, 1],
  ["anchored select", ANCHORED, "packages/ui/src/primitives/select/select.tsx", `${OVERLAY_BASE}<D.Popup />;`, 1],
  ["anchored autocomplete", ANCHORED, "packages/ui/src/primitives/autocomplete/autocomplete.tsx", `${OVERLAY_BASE}<D.Popup />;`, 1],
  ["anchored tooltip", ANCHORED, "packages/ui/src/primitives/tooltip/tooltip.tsx", `${OVERLAY_BASE}<D.Popup />;`, 1],
  ["anchored rule leaves modals alone", ANCHORED, DIALOG, `${OVERLAY_BASE}<D.Popup />;`, 0],
  ["anchored rule is for the primitive's own component file", ANCHORED, "packages/ui/src/primitives/popover/variants.ts", "export const P = Base.Popup;", 0],
  ["anchored rule leaves other primitives alone", ANCHORED, "packages/ui/src/primitives/button/button.tsx", `${OVERLAY_BASE}<D.Popup />;`, 0],
  [
    "anchored inline exception cannot excuse HARD anatomy",
    ANCHORED,
    POPOVER,
    `// eslint-disable-next-line orb/ui-overlay-anchored-anatomy -- bypass\n${OVERLAY_BASE}<D.Popup />;`,
    1,
  ],
  ["modal popup without its backdrop", MODAL, DIALOG, `${OVERLAY_BASE}<D.Popup />;`, 1],
  ["modal complete anatomy", MODAL, DIALOG, `${OVERLAY_BASE}<><D.Backdrop /><D.Popup /></>;`, 0],
  ["modal backdrop without popup", MODAL, DIALOG, `${OVERLAY_BASE}<D.Backdrop />;`, 1],
  ["modal with neither layer", MODAL, DIALOG, `${OVERLAY_BASE}<D.Root />;`, 1],
  ["modal positioner is forbidden", MODAL, DIALOG, `${OVERLAY_BASE}<><D.Backdrop /><D.Positioner><D.Popup /></D.Positioner></>;`, 1],
  ["modal missing layers and a positioner are two findings", MODAL, DIALOG, `${OVERLAY_BASE}<D.Positioner />;`, 2],
  ["modal alert dialog", MODAL, "packages/ui/src/primitives/alert-dialog/alert-dialog.tsx", `${OVERLAY_BASE}<D.Popup />;`, 1],
  ["modal drawer", MODAL, "packages/ui/src/primitives/drawer/drawer.tsx", `${OVERLAY_BASE}<D.Popup />;`, 1],
  ["modal rule leaves anchored floats alone", MODAL, POPOVER, `${OVERLAY_BASE}<D.Popup />;`, 0],
  ["modal rule leaves other primitives alone", MODAL, "packages/ui/src/primitives/button/button.tsx", `${OVERLAY_BASE}<D.Root />;`, 0],
  [
    "modal inline exception cannot excuse HARD anatomy",
    MODAL,
    DIALOG,
    `// eslint-disable-next-line orb/ui-overlay-modal-anatomy -- bypass\n${OVERLAY_BASE}<D.Popup />;`,
    1,
  ],
];

test.for(hardCases)("native UI HARD rules: $0", { timeout: CONFIG_LOAD_BUDGET_MS }, async ([, rule, path, source, count], { repoRoot }) => {
  expect(await hard(repoRoot, rule, path, source)).toHaveLength(count);
});

test("the HARD UI rules are absent from the ordinary profile, which admits inline exceptions", { timeout: CONFIG_LOAD_BUDGET_MS }, async ({ repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, DIALOG));
  expect(config.rules?.[ANCHORED]).toBeUndefined();
  expect(config.rules?.[MODAL]).toBeUndefined();
  const ct = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, CT));
  expect(ct.rules?.[COLOR]).toBeUndefined();
  expect(ct.rules?.[PROVIDER]).toBeUndefined();
});
