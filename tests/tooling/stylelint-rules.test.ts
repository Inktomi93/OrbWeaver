// The native Stylelint configuration: each custom rule and each value allow-list refuses its planted control and admits the structural forms.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import stylelint from "stylelint";
import config from "../../stylelint.config.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const AUTHORED_FILE = join(REPO_ROOT, "packages/client/src/styles/globals.css");
const THEME_FILE = join(REPO_ROOT, "packages/ui/src/styles/theme.css");
const SHELL_FILE = join(REPO_ROOT, "packages/client/src/features/app-shell/surfaces/shell/grid.css");
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

const FADE = "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }";
const SEQUENCE = "@keyframes sequence { 0% { opacity: 0; } 50% { opacity: 0.5; } 100% { opacity: 1; } }";
const ANIMATE = "animation: fade var(--motion-base) var(--ease-out-expo);";

test("a keyframe animation on a Base UI lifecycle attribute is refused unless a transition cannot express it", async () => {
  const hit = ["orb/no-lifecycle-keyframes"];
  expect(await rulesHit(`${FADE} ${layered(`.probe[data-open] { ${ANIMATE} }`)}`)).toEqual(hit);
  expect(await rulesHit(`${FADE} ${layered(".probe[data-closed] { animation-name: fade; }")}`)).toEqual(hit);
  expect(await rulesHit(`${FADE} ${layered(`.probe { &[data-ending-style] { ${ANIMATE} } }`)}`)).toEqual(hit);
  expect(await rulesHit(`${SEQUENCE} ${layered(".probe[data-open] { animation: sequence var(--motion-base) var(--ease-out-expo); }")}`)).toEqual([]);
  expect(await rulesHit(`${FADE} ${layered(".probe[data-open] { animation: fade var(--motion-shimmer) linear infinite; }")}`)).toEqual([]);
  expect(
    await rulesHit(
      `${FADE.replace("fade", "orb-word-reveal")} ${layered(".probe[data-open] { animation: orb-word-reveal var(--motion-base) var(--ease-out-expo); }")}`,
    ),
  ).toEqual([]);
  expect(await rulesHit(`${FADE} ${layered(".probe[data-open] { animation: none; }")}`)).toEqual([]);
  expect(await rulesHit(`${FADE} ${layered(`.probe { ${ANIMATE} }`)}`)).toEqual([]);
});

test("a transition names its properties; `all` is refused in either spelling", async () => {
  const hit = ["declaration-property-value-disallowed-list"];
  expect(await rulesHit(declaration("transition: all var(--motion-base) var(--ease-out-expo);"))).toEqual(hit);
  expect(await rulesHit(declaration("transition-property: all;"))).toEqual(hit);
  expect(await rulesHit(declaration("transition: opacity var(--motion-base) var(--ease-out-expo), all var(--motion-base);"))).toEqual(hit);
  expect(await rulesHit(declaration("transition: opacity var(--motion-base) var(--ease-out-expo);"))).toEqual([]);
  expect(await rulesHit(declaration("transition-property: opacity, scale;"))).toEqual([]);
});

test("logical properties are required, except the overflow axes the Safari 18 floor cannot spell logically", async () => {
  expect(await rulesHit(declaration("overflow-y: auto;"))).toEqual([]);
  expect(await rulesHit(declaration("overflow-x: auto;"))).toEqual([]);
  expect(await rulesHit(declaration("margin-left: 0;"))).toEqual(["logical-css/require-logical-properties"]);
});

test("a forced compositor layer is refused", async () => {
  expect(await rulesHit(declaration("will-change: transform;"))).toEqual(["property-disallowed-list"]);
  expect(await rulesHit(declaration("backface-visibility: hidden;"))).toEqual(["property-disallowed-list"]);
  // Momentum scrolling is native on every iOS the app serves, so the property does nothing there.
  expect(await rulesHit(declaration("-webkit-overflow-scrolling: touch;"))).toEqual(["property-disallowed-list"]);
  expect(await rulesHit(declaration("transform: translateZ(0);"))).toEqual(["declaration-property-value-disallowed-list"]);
  expect(await rulesHit(declaration("transform: translate3d(0, 0, 0);"))).toEqual(["declaration-property-value-disallowed-list"]);
  expect(await rulesHit(declaration("opacity: 0.5;"))).toEqual([]);
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
});

test("a fallback does not excuse a custom property nothing declares", async () => {
  const rule = "orb/no-undeclared-var-fallback";
  expect(await rulesHit(declaration("font-size: calc(var(--text-body) * var(--reading-body-scale, 1));"))).toEqual([rule]);
  expect(await rulesHit(declaration("color: var(--probe-gone, var(--color-primary));"))).toEqual([rule]);
  // Declared in a sheet, registered by the generated channel, written at runtime, or written by a vendor.
  expect(await rulesHit(declaration("color: var(--color-primary, red);"))).toEqual([]);
  expect(await rulesHit(declaration("opacity: var(--appearance-font-scale, 1);"))).toEqual([]);
  expect(await rulesHit(declaration("inset-inline-start: var(--orb-media-x, 50%);"))).toEqual([]);
  expect(await rulesHit(declaration("color: var(--shiki-dark, currentcolor);"))).toEqual([]);
  expect(await rulesHit(declaration("inline-size: var(--anchor-width, 0);"))).toEqual([]);
  // The probe's own declaration counts.
  expect(await rulesHit(layered(".probe {\n --probe-local: 1;\n opacity: var(--probe-local, 0.5);\n }"))).toEqual([]);
});

test("an appearance name a sheet spells is one the manifest's channel writes", async () => {
  const rule = "orb/appearance-name-in-manifest";
  const guarded = `:root:not([data-appearance-reduced-motion="off"])`;
  expect(await rulesHit(declaration("opacity: var(--appearance-reading-line-height);"))).toEqual([]);
  expect(await rulesHit(layered("@variant appearance-shadow-effects-true { .probe { opacity: 1; } }"))).toEqual([]);
  expect(await rulesHit(declaration("opacity: var(--appearance-line-hight);"))).toEqual([rule, "csstools/value-no-unknown-custom-properties"].toSorted());
  expect(await rulesHit(layered(':root[data-appearance-shadow="true"] .probe { opacity: 1; }'))).toEqual([rule]);
  expect(await rulesHit(layered("@variant appearance-shadow-effects-on { .probe { opacity: 1; } }"))).toEqual([rule]);
  // A client sheet keys a preference on its resolved variant; the OS-only one ignores the app's off.
  expect(await rulesHit(layered("@variant motion-reduce { .probe { opacity: 1; } }"))).toEqual([rule]);
  expect(await rulesHit(layered("@variant appearance-reduced-motion { .probe { opacity: 1; } }"))).toEqual([]);
  // A ui sheet has no resolved variant, so its OS arm must carry the root guard, or the app's off cannot beat the OS.
  expect(await rulesHit(layered("@variant motion-reduce { .probe { opacity: 1; } }"), FLOOR_FILE)).toEqual([rule]);
  expect(await rulesHit(layered("@variant contrast-more { .probe, .other { opacity: 1; } }"), FLOOR_FILE)).toEqual([rule]);
  expect(
    await rulesHit(layered('@variant contrast-more { :root:not([data-appearance-increased-contrast="off"]) .probe, .other { opacity: 1; } }'), FLOOR_FILE),
  ).toEqual([rule]);
  expect(await rulesHit(layered('@variant motion-reduce { :root:not([data-appearance-reduced-motion="off"]) .probe { opacity: 1; } }'), FLOOR_FILE)).toEqual(
    [],
  );
  // A variant nested in a rule guards through that rule's selectors, for its own declarations and for an `&` rule.
  expect(await rulesHit(layered(".probe { @variant motion-reduce { opacity: 1; } }"), FLOOR_FILE)).toEqual([rule]);
  expect(await rulesHit(layered(".probe { @variant motion-reduce { &::after { opacity: 1; } } }"), FLOOR_FILE)).toEqual([rule]);
  expect(await rulesHit(layered(':root:not([data-appearance-reduced-motion="off"]) .probe { @variant motion-reduce { opacity: 1; } }'), FLOOR_FILE)).toEqual(
    [],
  );
  expect(
    await rulesHit(layered(':root:not([data-appearance-reduced-motion="off"]) .probe { @variant motion-reduce { &::after { opacity: 1; } } }'), FLOOR_FILE),
  ).toEqual([]);
  // A declaration reached through nested at-rules still styles the enclosing rule.
  expect(await rulesHit(layered(".a { @variant motion-reduce { @variant hover { opacity: 1; } } }"), FLOOR_FILE)).toEqual([rule]);
  expect(await rulesHit(layered(".a { @variant motion-reduce { @supports (display: grid) { opacity: 1; } } }"), FLOOR_FILE)).toEqual([rule]);
  expect(await rulesHit(layered(`${guarded} .a { @variant motion-reduce { @variant hover { opacity: 1; } } }`), FLOOR_FILE)).toEqual([]);
  // The guard resolves through the whole ancestor chain and through `&` in the variant's own rules.
  expect(await rulesHit(layered(`${guarded} .a { .b { @variant motion-reduce { opacity: 1; } } }`), FLOOR_FILE)).toEqual([]);
  expect(await rulesHit(layered(`${guarded} .a { & .b { @variant motion-reduce { opacity: 1; } } }`), FLOOR_FILE)).toEqual([]);
  expect(await rulesHit(layered(`@variant motion-reduce { ${guarded} .p { &::after { opacity: 1; } } }`), FLOOR_FILE)).toEqual([]);
  expect(await rulesHit(layered("@variant motion-reduce { .p { &::after { opacity: 1; } } }"), FLOOR_FILE)).toEqual([rule]);
  // A variant prefix in `@apply` is read too; a sheet cannot guard it.
  expect(await rulesHit(layered(".probe { @apply motion-reduce:opacity-50; }"))).toEqual([rule]);
  expect(await rulesHit(layered(".probe { @apply hover:not-contrast-more:opacity-50; }"))).toEqual([rule]);
  expect(await rulesHit(layered(".probe { @apply appearance-reduced-motion:opacity-50; }"))).toEqual([]);
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

test("a shell region paints from tokens and names no component", async () => {
  const hits = (rules: string): Promise<string[]> => rulesHit(layered(rules), SHELL_FILE);
  for (const rules of [
    ".shell-grid { background: var(--color-background); }",
    ".shell-grid { background: color-mix(in oklab, var(--color-background) 72%, transparent); }",
    ".shell-main { background: oklch(from var(--color-card) l c h / 0.5); }",
    ".shell-main { background: oklch(from var(--color-card) l c h / calc(alpha * 0.5)); }",
    ".shell-main { background: rgb(from var(--color-card) r g b / 0.4); }",
    ".shell-grid { text-shadow: none; }",
    ".shell-panel-header > [data-slot='panel-overlay-close'] { opacity: 1; }",
    ".shell-main [data-slot='chat-room-flank-row'] .orb-chat-track { opacity: 1; }",
  ]) {
    expect(await hits(rules), rules).toEqual([]);
  }
  const refused: [string, string][] = [
    [".shell-grid { background: #fff; }", "orb/shell-paint-law"],
    [".shell-grid { background: oklch(0.2 0.1 200); }", "orb/shell-paint-law"],
    [".shell-grid { background: color-mix(in oklab, #fff 40%, var(--color-card)); }", "orb/shell-paint-law"],
    [".shell-grid { background: rgb(from red r g b / 0.5); }", "orb/shell-paint-law"],
    [".shell-grid { color: red; }", "color-named"],
    [".shell-grid { color: hwb(0 0% 0%); }", "orb/shell-paint-law"],
    [".shell-grid { color: color(srgb 1 0 0); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--glass-tint) r g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) 255 0 0); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) r g 0); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r + 255) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: oklch(from var(--color-card) calc(l * 0.9) c h); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(0.5 * r) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: hsl(from var(--color-card) calc(h + 30deg) s l); }", "orb/shell-paint-law"],
    [".shell-grid { color: hsl(from var(--color-card) calc(h * 2) s l); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r * 2) calc(g / 2) calc(b * 0.25)); }", "orb/shell-paint-law"],
    [".shell-grid { color: oklch(from var(--color-card) l c calc(h - 20)); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r * -1) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r * 100000) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r * 0.000001) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r / 0.01) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r / 1000) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: hsl(from var(--color-card) h s calc(l * -1)); }", "orb/shell-paint-law"],
    [".shell-grid { color: oklch(from var(--color-card) calc(l * 1000) c h); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r * 0) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r * 0 + 255) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) alpha alpha alpha); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) g r b); }", "orb/shell-paint-law"],
    [".shell-grid { color: oklch(from var(--color-card) calc(l + 0.1) c h); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(r + 30deg) g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) calc(255) calc(0) calc(0)); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) none none none); }", "orb/shell-paint-law"],
    [".shell-grid { color: rgb(from var(--color-card) red g b); }", "orb/shell-paint-law"],
    [".shell-grid { color: hsl(from var(--color-card) r g b); }", "orb/shell-paint-law"],
    [".shell-grid [data-slot='message-bubble'] { opacity: 1; }", "orb/shell-paint-law"],
    [".shell-grid [data-slot='empty-state-root'] { opacity: 1; }", "orb/shell-paint-law"],
    [".shell-grid .orb-gradient-ring { opacity: 1; }", "orb/shell-paint-law"],
  ];
  for (const [rules, rule] of refused) {
    expect(await hits(rules), rules).toContain(rule);
  }
  // The rule is scoped to the shell region files: the same selector is legal in the client styles home.
  expect(await rulesHit(layered(".shell-grid [data-slot='message-bubble'] { opacity: 1; }"))).toEqual([]);
});

test("the shipped stylesheets pass", async () => {
  const { results } = await stylelint.lint({ files: ["packages/**/*.css"], config, configBasedir: REPO_ROOT, cwd: REPO_ROOT });
  expect(results.length).toBeGreaterThan(0);
  expect(results.flatMap((result) => result.warnings.map((warning) => `${result.source}: ${warning.text}`))).toEqual([]);
});
