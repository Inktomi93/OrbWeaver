// THE EXECUTED PROOF FOR #1633 — the `jsx-a11y` components map and `control-has-associated-label`'s
// `ignoreElements` are ONE decision, and reading either list alone is a green that cannot see it.
//
// The mechanism, source-pinned at eslint-plugin-jsx-a11y 6.10.2
// (`lib/rules/control-has-associated-label.js`): the rule computes `var tag = elementType(openingElement)`
// — which APPLIES `settings["jsx-a11y"].components` — and only then asks `newIgnoreElements.has(tag)`. So a
// COMPONENT NAME in `ignoreElements` is unreachable for any component the map renames, and what actually
// decides whether a family is exempt is the map's lowercase target. That is why `"Switch"` sat in the ignore
// list for months while every `<Switch>` inside a `<Field>` was still RED, and why six call sites carried a
// measured-DEAD `aria-label` as a lint obligation (`tests/client/a11y/field-control-name.suite.ct.tsx`).
//
// #1633 remapped `Switch` to `input`. This file exists because that fix is a CONFIG VALUE with no gate: the
// `eslint-grant-liveness` policy only audits `files`/`ignores` selectors, so nothing else in the repo notices
// if a later edit flips the map back, widens `ignoreElements` with `"button"`, or drops the entry entirely.
// Each of the three was measured and rejected, and each rejection is an arm below — the cheap-looking fixes
// are silent COVERAGE LOSSES, not neutral refactors:
//   · `Switch: "button"`   → the six dead attributes come back as a lint obligation (arm: switchInField).
//   · `ignoreElements` +"button" → an unlabelled Toggle / Button / native <button> stops being reported
//                            (arms: toggle, nativeButton, iconOnlyButton).
//   · drop `Switch` from the map → `role-supports-aria-props` and
//                            `no-interactive-element-to-noninteractive-role` go blind on `<Switch>`
//                            (arms: switchAriaProp, switchNoninteractiveRole).
//
// The fixtures are TSX under the real `CLIENT_SRC` glob so the production config's `SHIPPED_SRC` jsx-a11y
// block actually selects them, driven through the real `eslint.config.js` — inspecting the option objects
// would prove nothing about what the rule sees. They declare no imports: jsx-a11y keys off the JSX element
// NAME, and messages are filtered by ruleId so unrelated policy on the fixtures cannot colour a verdict.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { expect, test } from "../support/tool-fixtures.ts";

const LABEL_RULE = "jsx-a11y/control-has-associated-label";
const ARIA_PROPS_RULE = "jsx-a11y/role-supports-aria-props";
const NONINTERACTIVE_ROLE_RULE = "jsx-a11y/no-interactive-element-to-noninteractive-role";

/** Each arm is one fixture file; the body is the JSX the arm is about. */
const ARMS = {
  // THE FIX ITSELF: a bare Switch as a Field's sole control. Base UI injects `aria-labelledby` from
  // FieldRootContext at render time, which the rule cannot see — so this passes only because `Switch` maps
  // to a tag the rule ignores. Flip the map back to `button` and this arm reds.
  switchInField: '<Field label="Probe"><Switch checked={false} /></Field>',
  // THE COVERAGE THE `"button"`-in-`ignoreElements` ARM WOULD HAVE SOLD. All three are what this rule is
  // turned on for (agent-navigability: an accessible name on every interactive element).
  toggle: "<Toggle pressed={false} />",
  nativeButton: '<button type="button" />',
  iconOnlyButton: "<IconButton />",
  // THE COVERAGE THE DROP-THE-MAP-ENTRY ARM WOULD HAVE SOLD — both need `Switch` to resolve to SOME element.
  switchAriaProp: '<Switch aria-checked={true} aria-label="probe" />',
  switchNoninteractiveRole: '<Switch aria-label="probe" role="presentation" />',
} as const;

type ArmName = keyof typeof ARMS;

const EXPECTED: Readonly<Record<ArmName, readonly string[]>> = {
  switchInField: [],
  toggle: [LABEL_RULE],
  nativeButton: [LABEL_RULE],
  iconOnlyButton: [LABEL_RULE],
  switchAriaProp: [ARIA_PROPS_RULE],
  switchNoninteractiveRole: [NONINTERACTIVE_ROLE_RULE],
};

const WATCHED = new Set<string>([LABEL_RULE, ARIA_PROPS_RULE, NONINTERACTIVE_ROLE_RULE]);

test("jsx-a11y: the components map and control-has-associated-label's ignoreElements decide together", async ({ scratch }: { readonly scratch: string }) => {
  const repoRoot = process.cwd();
  // The production jsx-a11y block selects `packages/client/src/**/*.{ts,tsx}`; a fixture anywhere else is
  // silently UNSELECTED and every arm would read green. This path is the arm-selection control.
  const fixtureRoot = join(scratch, "packages/client/src/features/a11y-policy-probe/components");
  mkdirSync(fixtureRoot, { recursive: true });
  for (const [name, jsx] of Object.entries(ARMS)) {
    writeFileSync(join(fixtureRoot, `${name}.tsx`), `export function Probe() {\n  return ${jsx};\n}\n`);
  }
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { jsx: "react-jsx", module: "nodenext", moduleResolution: "nodenext", noEmit: true, strict: true, target: "es2022" },
      include: ["packages/client/src/**/*.tsx"],
    }),
  );
  const productionConfigUrl = pathToFileURL(join(repoRoot, "eslint.config.js")).href;
  writeFileSync(
    join(scratch, "eslint.config.mjs"),
    `import production from ${JSON.stringify(productionConfigUrl)};\nexport default [...production, { files: ["packages/client/src/**/*.tsx"], languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: ${JSON.stringify(scratch)} } } }];\n`,
  );

  const eslint = new ESLint({ cwd: scratch, overrideConfigFile: join(scratch, "eslint.config.mjs") });
  const results = await eslint.lintFiles(Object.keys(ARMS).map((name) => join(fixtureRoot, `${name}.tsx`)));

  const seen: Record<string, readonly string[]> = {};
  for (const result of results) {
    const arm = result.filePath.slice(result.filePath.lastIndexOf("/") + 1, -".tsx".length);
    seen[arm] = result.messages.filter((message) => message.ruleId !== null && WATCHED.has(message.ruleId)).map((message) => message.ruleId ?? "");
  }

  expect(seen).toStrictEqual(EXPECTED);
}, 30_000);
