// The native Stylelint configuration: each custom rule and each value allow-list refuses its planted control and admits the structural forms.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import stylelint from "stylelint";
import config from "../../stylelint.config.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const AUTHORED_FILE = join(REPO_ROOT, "packages/client/src/styles/globals.css");

async function rulesHit(code: string, codeFilename = AUTHORED_FILE): Promise<string[]> {
  const { results } = await stylelint.lint({ code, codeFilename, config, configBasedir: REPO_ROOT });
  return results.flatMap((result) => result.warnings.map((warning) => warning.rule)).toSorted();
}

const declaration = (body: string): string => `.probe { ${body} }`;

test("each custom rule refuses its planted control", async () => {
  expect(await rulesHit(declaration("transition: opacity 200ms ease-in;"))).toEqual(["orb/motion-token-purity", "orb/motion-token-purity"]);
  expect(await rulesHit(declaration("color: #fff;"))).toEqual(["orb/no-raw-color-in-css"]);
  expect(await rulesHit(declaration("transform: translateX(0.5px);"))).toEqual(["orb/rest-transform-grid"]);
  expect(await rulesHit("@media (width > 48rem) { .probe { opacity: 1; } }")).toEqual(["orb/no-raw-media-condition"]);
  expect(await rulesHit(declaration("padding: var(--primitive-space-8);"))).toEqual(["orb/no-raw-media-condition"]);
});

test("a governed length takes tokens, formulas, viewport units and zero sentinels, never a raw length", async () => {
  const admitted = [
    "padding: var(--spacing-row);",
    "margin: calc(var(--spacing-row) * -1);",
    "height: calc(100dvh - var(--orb-keyboard-inset, 0px));",
    "min-height: 2lh;",
    "inset: -60% -40%;",
    "width: max-content;",
    "padding-block-end: env(safe-area-max-inset-bottom, env(safe-area-inset-bottom));",
    "margin-inline-start: round(down, calc((100% - var(--width-shell-content)) / 2), 1px);",
    "box-shadow: inset 0 calc(var(--border-width-control) * -1) 0 var(--color-sidebar-border);",
    "--list-track: 0px;",
    "--pane-deficit: max(0px, var(--dimension-content-reading-floor) - 100dvw);",
    "border-inline-start: var(--border-width-accent) solid var(--color-primary);",
  ];
  for (const body of admitted) {
    expect(await rulesHit(declaration(body)), body).toEqual([]);
  }
  const refused = [
    "padding: 13px;",
    "gap: 0.375rem;",
    "margin-inline-start: 0.1em;",
    "font-size: 15px;",
    "box-shadow: inset 0 0 0 2px var(--color-ring);",
    "border-inline-start: 2px solid var(--color-primary);",
    "--rail-w: 56px;",
    "min-width: calc(100% - 1rem);",
  ];
  for (const body of refused) {
    expect(await rulesHit(declaration(body)), body).toEqual(["declaration-property-value-allowed-list"]);
  }
});

test("stacking order, weight and tracking are tokens or the structural layers", async () => {
  for (const body of [
    "z-index: var(--z-overlay);",
    "z-index: calc(var(--z-overlay) - 1);",
    "z-index: -1;",
    "font-weight: var(--font-weight-semibold);",
    "font-weight: 100 900;",
    "letter-spacing: var(--tracking-caps);",
  ]) {
    expect(await rulesHit(declaration(body)), body).toEqual([]);
  }
  for (const body of ["z-index: 5;", "z-index: calc(var(--z-overlay) - 2);", "font-weight: 600;", "letter-spacing: 0.02em;"]) {
    expect(await rulesHit(declaration(body)), body).toEqual(["declaration-property-value-allowed-list"]);
  }
});

test("the generated theme is exempt from the authored-value rules", async () => {
  expect(await rulesHit(":root { --spacing-row: 0.5rem; color: #fff; }", join(REPO_ROOT, "packages/ui/src/styles/theme.css"))).toEqual([]);
});

test("the shipped stylesheets pass", async () => {
  const { results } = await stylelint.lint({ files: ["packages/**/*.css"], config, configBasedir: REPO_ROOT, cwd: REPO_ROOT });
  expect(results.length).toBeGreaterThan(0);
  expect(results.flatMap((result) => result.warnings.map((warning) => `${result.source}: ${warning.text}`))).toEqual([]);
});
