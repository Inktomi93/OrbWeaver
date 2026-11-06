// A focus ring's weight and offset are tokens: every fragment compiles its geometry through a custom property, so a
// retuned token moves every ring, and no fragment bakes a length in.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node";
import {
  cn,
  FOCUS_RING,
  FOCUS_RING_BARE,
  FOCUS_RING_HAS,
  FOCUS_RING_INSET,
  FOCUS_RING_ON_POPOVER,
  FOCUS_RING_ON_SIDEBAR,
  FOCUS_RING_OUTLINE,
  FOCUS_RING_OUTLINE_INSET,
  FOCUS_RING_WITHIN,
  FOCUS_RING_WITHIN_INSET,
} from "@orb/ui/lib";
import { TOKENS } from "@orb/ui/tokens";
import { compile } from "tailwindcss";

const THEME_CSS = readFileSync(join(import.meta.dirname, "../../../packages/ui/src/styles/theme.css"), "utf8");
const GEOMETRY = /^(?<property>--tw-ring-offset-width|outline-offset|outline-width): (?<value>.+);$/u;
const OFFSET = TOKENS["focus-ring.offset"].cssVar;

const FRAGMENTS: readonly (readonly [name: string, classes: string])[] = [
  ["FOCUS_RING", FOCUS_RING],
  ["FOCUS_RING_BARE", FOCUS_RING_BARE],
  ["FOCUS_RING_HAS", FOCUS_RING_HAS],
  ["FOCUS_RING_INSET", FOCUS_RING_INSET],
  ["FOCUS_RING_ON_POPOVER", FOCUS_RING_ON_POPOVER],
  ["FOCUS_RING_ON_SIDEBAR", FOCUS_RING_ON_SIDEBAR],
  ["FOCUS_RING_OUTLINE", FOCUS_RING_OUTLINE],
  ["FOCUS_RING_OUTLINE_INSET", FOCUS_RING_OUTLINE_INSET],
  ["FOCUS_RING_WITHIN", FOCUS_RING_WITHIN],
  ["FOCUS_RING_WITHIN_INSET", FOCUS_RING_WITHIN_INSET],
];

/** The declarations inside utility rules; the `@layer properties` block initialises the same variables to `0px`. */
function utilityDeclarations(css: string): readonly string[] {
  const declarations: string[] = [];
  let inUtility = false;
  for (const line of css.split("\n")) {
    const text = line.trim();
    if (text.endsWith("{")) {
      inUtility = text.startsWith(".");
    } else if (text === "}") {
      inUtility = false;
    } else if (inUtility) {
      declarations.push(text);
    }
  }
  return declarations;
}

async function compiled(classes: string): Promise<string> {
  const compiler = await compile(`${THEME_CSS}\n@tailwind utilities;`);
  return compiler.build(classes.split(/\s+/u));
}

for (const [name, classes] of FRAGMENTS) {
  test(`${name} reads its offset and outline width from tokens`, async () => {
    const geometry = utilityDeclarations(await compiled(classes)).filter((declaration) => GEOMETRY.test(declaration));
    expect(geometry.filter((declaration) => !declaration.includes("var(--"))).toEqual([]);
  });
}

test("the offset fragments compile a ring offset and an outline offset, so the check above has something to read", async () => {
  const css = await compiled(`${FOCUS_RING} ${FOCUS_RING_OUTLINE}`);
  expect(css).toContain(`--tw-ring-offset-width: var(${OFFSET})`);
  expect(css).toContain(`outline-offset: var(${OFFSET})`);
});

// A variant that re-hues the offset (a sidebar, a popover) merges over FOCUS_RING; the offset width must survive it.
test.for([
  ["a ring on a sidebar", cn(FOCUS_RING, FOCUS_RING_ON_SIDEBAR)],
  ["a ring on a popover", cn(FOCUS_RING, FOCUS_RING_ON_POPOVER)],
  ["a ring alone", cn(FOCUS_RING)],
] as const)("%s keeps its offset beside the offset colour", ([, merged]) => {
  expect(merged).toContain(`ring-offset-(length:${OFFSET})`);
});
