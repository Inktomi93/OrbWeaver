// The native Stylelint configuration: each custom rule and each value allow-list refuses its planted control and admits the structural forms.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import stylelint from "stylelint";
import config from "../../stylelint.config.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const AUTHORED_FILE = join(REPO_ROOT, "packages/client/src/styles/globals.css");
const THEME_FILE = join(REPO_ROOT, "packages/ui/src/styles/theme.css");
const FLOOR_FILE = join(REPO_ROOT, "packages/ui/src/styles/motion-floor.css");

async function rulesHit(code: string, codeFilename = AUTHORED_FILE): Promise<string[]> {
  const { results } = await stylelint.lint({ code, codeFilename, config, configBasedir: REPO_ROOT });
  return results.flatMap((result) => result.warnings.map((warning) => warning.rule)).toSorted();
}

const layered = (rules: string): string => `@layer client { ${rules} }`;
const declaration = (body: string): string => layered(`.probe { ${body} }`);

test("each custom rule refuses its planted control", async () => {
  expect(await rulesHit(declaration("transition: opacity 200ms ease-in;"))).toEqual(["orb/motion-token-purity", "orb/motion-token-purity"]);
  expect(await rulesHit(declaration("color: #fff;"))).toEqual(["orb/no-raw-color-in-css"]);
  expect(await rulesHit(declaration("transform: translateX(0.5px);"))).toEqual(["orb/rest-transform-grid"]);
  expect(await rulesHit(layered("@media (width > 48rem) { .probe { opacity: 1; } }"))).toEqual(["orb/no-raw-media-condition"]);
  expect(await rulesHit(declaration("padding: var(--primitive-space-8);"))).toEqual(["orb/no-raw-media-condition"]);
});

test("every style rule sits in a declared layer; Tailwind's own at-rules place themselves", async () => {
  expect(await rulesHit(".probe { opacity: 1; }")).toEqual(["orb/rule-in-layer"]);
  expect(await rulesHit("@layer client { @variant shell-mobile { .probe { opacity: 1; } } }")).toEqual([]);
  expect(await rulesHit("@utility orb-probe { opacity: 1; }")).toEqual([]);
  expect(await rulesHit("@keyframes probe { from { opacity: 0; } }")).toEqual([]);
  expect(await rulesHit("@layer Client { .probe { opacity: 1; } }")).toEqual(["layer-name-pattern"]);
  expect(await rulesHit("@theme { --probe-step: 1rem; }", THEME_FILE)).toEqual([]);
  expect(await rulesHit(":root { --probe-step: 1rem; }", THEME_FILE)).toEqual(["orb/rule-in-layer"]);
});

test("Tailwind's directives and functions are known; anything else unknown is refused", async () => {
  expect(await rulesHit('@reference "@orb/ui/styles/globals.css";')).toEqual([]);
  expect(await rulesHit("@custom-variant probe (&:is([data-probe]));")).toEqual([]);
  expect(await rulesHit("@layer client { .probe { @apply orb-gradient-ring; } }")).toEqual([]);
  expect(await rulesHit(declaration("--probe-pad: --spacing(4);"))).toEqual([]);
  expect(await rulesHit(layered("@probe { .probe { opacity: 1; } }"))).toEqual(["at-rule-no-unknown"]);
  // A dashed function is a custom function to the grammar, so the negative control is an undashed one.
  expect(await rulesHit(declaration("padding: probe(4);"))).toEqual(["declaration-property-value-no-unknown", "function-no-unknown"]);
});

test("a custom property the sheets read is declared somewhere, or named as runtime-written", async () => {
  expect(await rulesHit(declaration("color: var(--color-nope);"))).toEqual(["csstools/value-no-unknown-custom-properties"]);
  expect(await rulesHit(declaration("color: var(--color-primary);"))).toEqual([]);
  expect(await rulesHit(declaration("max-inline-size: var(--width-shell-content);"))).toEqual([]);
  expect(await rulesHit(declaration("inset-inline-start: var(--x, 50%);"))).toEqual([]);
});

test("an appearance name a sheet spells is one the manifest's channel writes", async () => {
  const rule = "orb/appearance-name-in-manifest";
  expect(await rulesHit(declaration("opacity: var(--appearance-reading-line-height);"))).toEqual([]);
  expect(await rulesHit(layered("@variant appearance-shadow-effects-true { .probe { opacity: 1; } }"))).toEqual([]);
  expect(await rulesHit(declaration("opacity: var(--appearance-line-hight);"))).toEqual([rule, "csstools/value-no-unknown-custom-properties"].toSorted());
  expect(await rulesHit(layered(':root[data-appearance-shadow="true"] .probe { opacity: 1; }'))).toEqual([rule]);
  expect(await rulesHit(layered("@variant appearance-shadow-effects-on { .probe { opacity: 1; } }"))).toEqual([rule]);
  // A client sheet keys a preference on its resolved variant; the OS-only one ignores the app's off.
  expect(await rulesHit(layered("@variant motion-reduce { .probe { opacity: 1; } }"))).toEqual([rule]);
  expect(await rulesHit(layered("@variant appearance-reduced-motion { .probe { opacity: 1; } }"))).toEqual([]);
  expect(await rulesHit(layered("@variant motion-reduce { .probe { opacity: 1; } }"), FLOOR_FILE)).toEqual([]);
});

test("physical properties, qualifying types, ids, deep selectors and important declarations are refused", async () => {
  expect(await rulesHit(declaration("margin-left: var(--spacing-row);"))).toEqual(["logical-css/require-logical-properties"]);
  expect(await rulesHit(declaration("text-align: left;"))).toEqual(["logical-css/require-logical-keywords"]);
  expect(await rulesHit(layered("html[data-probe] .probe { opacity: 1; }"))).toEqual(["selector-no-qualifying-type"]);
  expect(await rulesHit(layered("#probe { opacity: 1; }"))).toEqual(["selector-max-id", "selector-max-specificity"]);
  expect(await rulesHit(layered(".a .b .c .d .e .f { opacity: 1; }"))).toEqual(["selector-max-compound-selectors"]);
  expect(await rulesHit(layered(".probe { .nested { .deeper { opacity: 1; } } }"))).toEqual(["max-nesting-depth"]);
  expect(await rulesHit(declaration("opacity: 1 !important;"))).toEqual(["declaration-no-important"]);
  expect(await rulesHit("@layer motion { .probe { opacity: 1 !important; } }", FLOOR_FILE)).toEqual([]);
  expect(await rulesHit(declaration("-webkit-transition: opacity var(--motion-fast) var(--ease-out-expo);"))).toEqual(["property-no-vendor-prefix"]);
  expect(await rulesHit(declaration("opacity: 1; /* measured on the live stage */"))).toEqual(["comment-word-disallowed-list"]);
  expect(await rulesHit(declaration("opacity: 1; /* see HUD-1 */"))).toEqual(["comment-word-disallowed-list"]);
});

test("a decorative loop owns its easing; its duration, a one-shot animation and a transition still ride tokens", async () => {
  expect(await rulesHit(declaration("animation: spin var(--motion-ambient) ease-in-out infinite alternate;"))).toEqual([]);
  expect(await rulesHit(declaration("animation: spin var(--motion-ambient) var(--ease-spinner) infinite;"))).toEqual([]);
  expect(await rulesHit(declaration("animation: spin 2s linear infinite;"))).toEqual(["orb/motion-token-purity"]);
  expect(await rulesHit(declaration("animation: enter var(--motion-transit) ease-out both;"))).toEqual(["orb/motion-token-purity"]);
  expect(await rulesHit(declaration("transition: opacity var(--motion-fast) ease-out;"))).toEqual(["orb/motion-token-purity"]);
  expect(await rulesHit(declaration("transition: opacity var(--motion-fast) var(--ease-out-expo);"))).toEqual([]);
});

test("a container condition is bound to the container ladder, and a shadow colour to a served variable", async () => {
  expect(await rulesHit(layered("@container shell-main (max-width: 32rem) { .probe { opacity: 1; } }"))).toEqual([]);
  expect(await rulesHit(layered("@container (max-width: 30rem) { .probe { opacity: 1; } }"))).toEqual(["orb/no-raw-media-condition"]);
  expect(await rulesHit(layered("@container (max-width: 512px) { .probe { opacity: 1; } }"))).toEqual(["orb/no-raw-media-condition"]);
  for (const body of [
    "box-shadow: var(--shadow-overlay), inset 0 0 0 var(--border-width-accent) var(--color-ring);",
    "box-shadow: 0 0 0 transparent;",
    "text-shadow: 0 1px 2px oklch(from var(--color-backdrop) l c h / 0.45);",
    "--shell-band-ember: inset 0 var(--border-width-accent) 0 color-mix(in oklab, var(--color-primary) 55%, transparent);",
    "filter: drop-shadow(0 12px 32px var(--color-shadow-ambient-far));",
  ]) {
    expect(await rulesHit(declaration(body)), body).toEqual([]);
  }
  for (const body of [
    "text-shadow: 0 0 var(--spacing-px) #000;",
    "filter: drop-shadow(0 0 var(--spacing-px) oklch(0 0 0 / 0.4));",
    "--shell-band-rule: 0 0 0 rgb(0 0 0 / 0.2);",
  ]) {
    expect(await rulesHit(declaration(body)), body).toContain("orb/shadow-from-ingredients");
  }
});

test("a governed length takes tokens, formulas, viewport units and zero sentinels, never a raw length", async () => {
  const admitted = [
    "padding: var(--spacing-row);",
    "margin: calc(var(--spacing-row) * -1);",
    "block-size: calc(100dvh - var(--orb-keyboard-inset, 0px));",
    "min-block-size: 2lh;",
    "inset: -60% -40%;",
    "inline-size: max-content;",
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
    "min-inline-size: calc(100% - 1rem);",
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
    "letter-spacing: var(--tracking-caps);",
    "letter-spacing: calc(var(--appearance-reading-letter-spacing) * 1em);",
  ]) {
    expect(await rulesHit(declaration(body)), body).toEqual([]);
  }
  expect(await rulesHit(layered('@font-face { font-family: Probe; font-weight: 100 900; src: url("probe.woff2"); }'))).toEqual([]);
  for (const body of [
    "z-index: 5;",
    "z-index: calc(var(--z-overlay) - 2);",
    "font-weight: 600;",
    "letter-spacing: 0.02em;",
    "letter-spacing: calc(var(--appearance-reading-letter-spacing) * 2em);",
  ]) {
    expect(await rulesHit(declaration(body)), body).toEqual(["declaration-property-value-allowed-list"]);
  }
});

test("the generated theme is exempt from the authored-value rules, not from the structural ones", async () => {
  expect(await rulesHit("@layer theme {\n  :root {\n    --spacing-row: 0.5rem;\n    color: #fff;\n  }\n}\n", THEME_FILE)).toEqual([]);
});

test("the shipped stylesheets pass", async () => {
  const { results } = await stylelint.lint({ files: ["packages/**/*.css"], config, configBasedir: REPO_ROOT, cwd: REPO_ROOT });
  expect(results.length).toBeGreaterThan(0);
  expect(results.flatMap((result) => result.warnings.map((warning) => `${result.source}: ${warning.text}`))).toEqual([]);
});
