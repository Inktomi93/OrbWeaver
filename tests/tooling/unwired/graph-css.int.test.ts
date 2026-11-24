// The custom-property pass: a property a sheet declares is read by a var() anywhere, by a class Tailwind compiles from
// a source string, by a variant's query, or by a token reference; one only a script string names is reported apart.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { cssGraph, FRESH_BUILD } from "../../../tooling/src/unwired/index.ts";
import { graphTree, tailwindcss } from "./_planted.ts";

const THEME = "packages/ui/src/styles/theme.css";
// Stacked variants that make a utility's token longer than any fixed cap would have kept.
const LONG_VARIANT_COUNT = 60;

test("each kind of read keeps its property; an unread one and a script-named one are reported", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...tailwindcss(),
      [THEME]: [
        "@theme {",
        "  --color-brand: red;",
        "  --breakpoint-shell: 40rem;",
        "}",
        ":root {",
        "  --pad-used: 1px;",
        "  --spare: 2px;",
        "  --named: 3px;",
        "  --primitive-space-4: 4px;",
        "}",
        ".box { padding: var(--pad-used); }",
      ].join("\n"),
      "packages/ui/src/tokens/tokens.json": JSON.stringify({ space: { gap: "{primitive.space.4}" } }),
      "packages/client/owner-css-surface.ts": "export const OWNER = [];",
      "packages/ui/src/box.ts": ['export const box = "bg-brand shell:flex";', 'export const named = "--named";'].join("\n"),
    }),
  );
  const report = await cssGraph(root, () => undefined);
  expect(report.buckets["css-property-unread"]).toEqual([`${THEME}:--spare`]);
  expect(report.buckets["css-property-named-in-script-only"]).toEqual([`${THEME}:--named`]);
});

// A member holding a property's name reads the property only where the product reads the member: a send of the holder
// hands the name to a receiver that never resolves it as a variable.
test("a held name is read through a read of its holder, never through a send, in a dump as in a build", { timeout: 120_000 }, async ({
  plantedTree,
  scratch,
}) => {
  const root = await plantedTree(
    graphTree({
      ...tailwindcss(),
      [THEME]: [":root {", "  --held-read: 1px;", "  --held-sent: 2px;", "}"].join("\n"),
      "packages/ui/src/tokens/tokens.json": "{}",
      "packages/client/owner-css-surface.ts": "export const OWNER = [];",
      "packages/ui/src/held.ts": [
        "declare function send(value: unknown): void;",
        'const NAMES = { shown: "--held-read", shipped: "--held-sent" };',
        "export const shown = (): string => NAMES.shown;",
        "export const ship = (): void => send(NAMES);",
      ].join("\n"),
    }),
  );
  const dump = join(scratch, "graph.dump");
  const report = await cssGraph(root, () => undefined, { ...FRESH_BUILD, dump });
  // the sent name is no read: only the script names it
  expect(report.buckets["css-property-named-in-script-only"]).toEqual([`${THEME}:--held-sent`]);
  expect(report.buckets["css-property-unread"]).toEqual([]);
  expect((await cssGraph(root, () => undefined, { ...FRESH_BUILD, from: dump })).buckets).toEqual(report.buckets);
});

// A token's length ends no walk: a utility behind many stacked variants still reads the theme property it compiles to.
test("a class token past any fixed length still reads its property", { timeout: 120_000 }, async ({ plantedTree }) => {
  const long = `${"[&_a]:".repeat(LONG_VARIANT_COUNT)}bg-brand`;
  const root = await plantedTree(
    graphTree({
      ...tailwindcss(),
      [THEME]: ["@theme {", "  --color-brand: red;", "}", ":root {", "  --spare: 2px;", "}"].join("\n"),
      "packages/ui/src/tokens/tokens.json": "{}",
      "packages/client/owner-css-surface.ts": "export const OWNER = [];",
      "packages/ui/src/box.ts": `export const box = "${long}";`,
    }),
  );
  const report = await cssGraph(root, () => undefined);
  // the other property is the positive control: the pass ran and reported what nothing reads
  expect(report.buckets["css-property-unread"]).toEqual([`${THEME}:--spare`]);
});
