// The tooling plumbing literal laws (ports, wall clocks, retired gate-ignore markers) judged by the native ESLint profiles.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { CT_VITE_PORT, DEV_PORTS, E2E_PORTS, STAGE_BAND_PORT_NUMBERS } from "../../../../tooling/src/floor/host/ports.ts";
import { scaledBudget } from "../../_load-budget.ts";

// The first row of each profile loads the whole repo config; later rows reuse that profile's loaded instance.
const CONFIG_LOAD_TIMEOUT = scaledBudget(120_000);
const instances = new Map<string, ESLint>();

const CLOCK = "orb/tooling-clock-budget";
const PORT = "orb/tooling-port-registry";
const RESTRICTED_SYNTAX = "no-restricted-syntax";
const WARNING_COMMENTS = "no-warning-comments";
const PORTS_HOME = "tooling/src/floor/host/ports.ts";
const [STAGE_BAND_SERVER] = STAGE_BAND_PORT_NUMBERS;

type Profile = "ordinary" | "hard";

/** The messages ONE rule of the real repo config produces for a source at a path; a path the rule is not scoped to
 *  yields no messages because the effective config leaves the rule off there. */
async function messages(
  root: string,
  profile: Profile,
  rule: string,
  probe: { readonly source: string; readonly path: string },
): Promise<readonly Linter.LintMessage[]> {
  const { source, path } = probe;
  const filename = join(root, path);
  const key = `${root}:${profile}`;
  const eslint = instances.get(key) ?? new ESLint({ cwd: root, ...(profile === "hard" ? { overrideConfigFile: join(root, "eslint-hard.config.js") } : {}) });
  instances.set(key, eslint);
  const config = await eslint.calculateConfigForFile(filename);
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx,mjs}"],
      plugins: config?.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: config?.linterOptions ?? {},
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename },
  );
  return found.filter(({ fatal, ruleId }) => fatal === true || ruleId === rule);
}

const SANCTIONED_BUDGET = "declare function budget(n: number): number;\ndeclare const NAV_BASE_MS: number;\n";

// ── tooling-clock-budget: 5 mustFlag / 6 mustPass of the retired gate, plus the scope fence ─────────────────────────
const CLOCK_ROWS: readonly (readonly [string, string, string, number])[] = [
  ["timeout option", "tooling/src/ui-audit/ops/walk.ts", "export const opts = { timeout: 30_000 };\n", 1],
  [
    "named-const dodge reaches tests/tooling",
    "tests/tooling/ui-audit/cli.int.test.ts",
    "const STEP_TIMEOUT_MS = 5000;\nexport const x = STEP_TIMEOUT_MS;\n",
    1,
  ],
  ["ceiling-scale setTimeout", "tooling/src/motion-audit/ops/drive.ts", "export const wait = (): void => {\n  setTimeout(() => undefined, 30_000);\n};\n", 1],
  ["nested option object reads the leaf", "tooling/src/snap/lib/budgets.ts", "export const budgets = { expect: { timeout: 5000 } };\n", 1],
  ["TIMEOUT_MS const without BASE", "tooling/src/snap/lib/nav.ts", "export const NAV_TIMEOUT_MS = 15_000;\n", 1],
  ["quoted option key", "tooling/src/snap/lib/quoted.ts", "export const opts = { 'timeout': 30_000 };\n", 1],
  ["derived ceiling", "tooling/src/ui-audit/lib/budgets.ts", `export const budgets = { timeout: budget(NAV_BASE_MS) };\n${SANCTIONED_BUDGET}`, 0],
  [
    "BASE suffix declares the quiet-box literal",
    "tooling/src/motion-audit/lib/budgets.ts",
    "const NAV_TIMEOUT_BASE_MS = 15_000;\nexport const x = NAV_TIMEOUT_BASE_MS;\n",
    0,
  ],
  [
    "BASE prefix with the clock suffix",
    "tooling/src/motion-audit/lib/base.ts",
    "const BASE_NAV_TIMEOUT_MS = 15_000;\nexport const x = BASE_NAV_TIMEOUT_MS;\n",
    0,
  ],
  [
    "a short setTimeout is a settle, not a ceiling",
    "tooling/src/snap/ops/drive.ts",
    "export const settle = (): void => {\n  setTimeout(() => undefined, 400);\n};\n",
    0,
  ],
  ["a verdict threshold is not a clock name", "tooling/src/motion-audit/lib/thresholds.ts", "export const BLOCKING_BUDGET_MS = 50;\n", 0],
  ["tests/e2e/support was never this law's", "tests/e2e/support/boot.ts", "export const boot = { timeout: 30_000 };\n", 0],
  [
    "a method call named setTimeout is not the global",
    "tooling/src/snap/ops/timer.ts",
    "export const t = (timers: { setTimeout(fn: () => void, ms: number): void }): void => timers.setTimeout(() => undefined, 30_000);\n",
    0,
  ],
];

test.for(CLOCK_ROWS)("native wall-clock law: %s", { timeout: CONFIG_LOAD_TIMEOUT }, async ([, path, source, count], { repoRoot }) => {
  expect(await messages(repoRoot, "ordinary", CLOCK, { source, path })).toHaveLength(count);
});

// ── tooling-port-registry: 6 mustFlag / 4 mustPass of the retired gate, home carved out by path ─────────────────────
const PORT_ROWS: readonly (readonly [string, string, string, number])[] = [
  ["a reserved registry value respelled", "tooling/src/stack/ops/up.ts", `export const p = ${String(DEV_PORTS.server)};\n`, 1],
  [
    "a stage-band value respelled, one finding per literal",
    "tooling/src/snap/lib/stage-plan.ts",
    `export const stage = { server: ${String(STAGE_BAND_SERVER)}, vite: 5273 };\n`,
    2,
  ],
  [
    "the e2e support tree is in scope",
    "tests/e2e/support/modes.ts",
    `export const mode = { name: "local", port: ${String(E2E_PORTS.singleUser.server)} };\n`,
    1,
  ],
  ["a hand-picked port at a port-named const", "tooling/src/stack/lib/spawners.ts", "const FIXTURE_PORT = 8123;\nexport const x = FIXTURE_PORT;\n", 1],
  ["a hand-picked port at a port-named property", "tooling/src/snap/ops/capture.ts", "export const opts = { ctPort: 3101 };\n", 1],
  ["a registry value spelled with a numeric separator", "tooling/src/stack/ops/sep.ts", "export const p = 5_173;\n", 1],
  ["a registry value spelled as hex", "tooling/src/stack/ops/hex.ts", "export const p = 0x2254;\n", 1],
  [
    "the registry itself is the one home",
    PORTS_HOME,
    `export const DEV_PORTS = { server: ${String(DEV_PORTS.server)}, vite: ${String(DEV_PORTS.vite)} };\n`,
    0,
  ],
  [
    "reading the registry and offsetting is the sanctioned shape",
    "tooling/src/snap/lib/stage-plan.ts",
    'import { DEV_PORTS } from "../../floor/host/ports.ts";\nexport const staged = DEV_PORTS.server + 100;\n',
    0,
  ],
  [
    "a port inside a string is not a numeric literal",
    "tooling/src/snap/ops/socket.ts",
    'export const dev = { name: "single-user", baseUrl: "http://localhost:5173" };\n',
    0,
  ],
  ["a four-digit number at a non-port key", "tests/e2e/support/actors.ts", "export const model = { contextWindow: 8192, maxTokens: 4096 };\n", 0],
  ["tests/tooling was never this law's", "tests/tooling/snap/ports.test.ts", `export const dev = ${String(DEV_PORTS.server)};\n`, 0],
];

test.for(PORT_ROWS)("native port-registry law: %s", { timeout: CONFIG_LOAD_TIMEOUT }, async ([, path, source, count], { repoRoot }) => {
  expect(await messages(repoRoot, "ordinary", PORT, { source, path })).toHaveLength(count);
});

// ── tooling-runner-config-literals: 6 mustFlag / 3 mustPass of the retired HARD gate ───────────────────────────────
const CONFIG_ROWS: readonly (readonly [string, string, string, number])[] = [
  [
    "a fixed vitest lane timeout beside a derived sibling",
    "vitest.config.ts",
    `export default { test: { testTimeout: 5000, hookTimeout: budget(10_000) } };\n${SANCTIONED_BUDGET}`,
    1,
  ],
  ["the e2e webServer boot ceiling", "playwright.config.ts", 'export default { webServer: { command: "x", timeout: 180_000 } };\n', 1],
  ["the CT vite port respelled by value", "playwright-ct.config.ts", `export default { use: { ctPort: ${String(CT_VITE_PORT)} } };\n`, 1],
  ["a hand-picked CT port", "playwright-ct.config.ts", "export default { use: { ctPort: 4242 } };\n", 1],
  [
    "a named clock const handed to budget",
    "playwright-ct.config.ts",
    `const STEP_TIMEOUT_MS = 5000;\nexport default { timeout: budget(STEP_TIMEOUT_MS) };\n${SANCTIONED_BUDGET}`,
    1,
  ],
  [
    "the sanctioned shapes: derived clocks, a BASE const, the registry port",
    "playwright-ct.config.ts",
    `const BASE_TEST_TIMEOUT_MS = 30_000;\nexport default { timeout: budget(BASE_TEST_TIMEOUT_MS), use: { ctPort: CT_VITE_PORT } };\n${SANCTIONED_BUDGET}declare const CT_VITE_PORT: number;\n`,
    0,
  ],
  [
    "counts and a non-port four-digit number",
    "playwright-ct.config.ts",
    "export default { expect: { toHaveScreenshot: { maxDiffPixels: 8192 } }, retries: 2, workers: 4 };\n",
    0,
  ],
  [
    "selector rows beside a derived clock",
    "vitest.config.ts",
    `export default { test: { include: ["tests/**/*.test.ts"], testTimeout: budget(5000) }, reporters: ["default"] };\n${SANCTIONED_BUDGET}`,
    0,
  ],
];

test.for(CONFIG_ROWS)("native runner-config law: %s", { timeout: CONFIG_LOAD_TIMEOUT }, async ([, path, source, count], { repoRoot }) => {
  expect(await messages(repoRoot, "hard", RESTRICTED_SYNTAX, { source, path })).toHaveLength(count);
});

test("an unparseable runner config is a fatal lint verdict, never a clean zero", { timeout: CONFIG_LOAD_TIMEOUT }, async ({ repoRoot }) => {
  const found = await messages(repoRoot, "hard", RESTRICTED_SYNTAX, { source: "export default { test: {\n", path: "vitest.config.ts" });
  expect(found.some(({ fatal }) => fatal === true)).toBe(true);
});

test.for(["vitest.config.ts", "playwright.config.ts", "playwright-ct.config.ts"])(
  "runner config %s cannot be excused by an inline directive",
  { timeout: CONFIG_LOAD_TIMEOUT },
  async (path, { repoRoot }) => {
    const source = `// eslint-disable-next-line ${RESTRICTED_SYNTAX} -- Attempted hard bypass.\nexport default { test: { testTimeout: 5000 } };\n`;
    expect(await messages(repoRoot, "hard", RESTRICTED_SYNTAX, { source, path })).toHaveLength(1);
  },
);

// ── gate-ignore-inventory: 4 mustFlag / 3 mustPass of the retired HARD gate ────────────────────────────────────────
const MARKER_ROWS: readonly (readonly [string, string, string, number])[] = [
  ["a marker naming no owner", "packages/ui/src/x/x.ts", "// @orb-gate-ignore no-such-gate: retired marker\nexport const x = 1;\n", 1],
  [
    "the gate corpus is marker-bearing surface",
    "tooling/src/verify/gates/x.ts",
    "// @orb-gate-ignore old-gate(position): retired marker\nexport const x = 1;\n",
    1,
  ],
  ["a trailing marker opens a real comment", "tooling/src/stack/lib/x.ts", "export const x = 1; // @orb-gate-ignore old-gate: trailing residue\n", 1],
  [
    "the showcase workspace is in scope",
    "packages/showcase-plugins/src/index.ts",
    "// @orb-gate-ignore old-gate: showcase residue\nexport const plugin = true;\n",
    1,
  ],
  ["tests are in scope", "tests/tooling/x.ts", "// @orb-gate-ignore old-gate: test residue\nexport const x = 1;\n", 1],
  ["the node helper executables are in scope", "tests/support/node/x.mjs", "// @orb-gate-ignore old-gate: helper residue\nexport const x = 1;\n", 1],
  [
    "a quotation in a node helper stays a mention",
    "tests/support/node/x.mjs",
    "// the retired grammar was `// @orb-gate-ignore old-gate: <reason>`\nexport const x = 1;\n",
    0,
  ],
  ["a spelling inside a string is fixture data", "tests/tooling/x.ts", 'export const fixture = "// @orb-gate-ignore no-such-gate: text";\n', 0],
  [
    "a quotation later in prose is a mention",
    "tooling/src/verify/gates/x.ts",
    "// the retired grammar was `// @orb-gate-ignore old-gate(position): <reason>`\nexport const x = 1;\n",
    0,
  ],
  ["source with no marker is clean", "packages/ui/src/x/x.ts", "export const x = 1;\n", 0],
];

test.for(MARKER_ROWS)("native retired-marker law: %s", { timeout: CONFIG_LOAD_TIMEOUT }, async ([, path, source, count], { repoRoot }) => {
  expect(await messages(repoRoot, "hard", WARNING_COMMENTS, { source, path })).toHaveLength(count);
});

test("a retired marker cannot be excused by an inline directive", { timeout: CONFIG_LOAD_TIMEOUT }, async ({ repoRoot }) => {
  const source = `/* eslint-disable ${WARNING_COMMENTS} -- Attempted hard bypass. */\n// @orb-gate-ignore old-gate: residue\nexport const x = 1;\n`;
  expect(await messages(repoRoot, "hard", WARNING_COMMENTS, { source, path: "packages/ui/src/x/x.ts" })).toHaveLength(1);
});
