import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCssFacts } from "../../../../tooling/src/verify/ops/resource-css.ts";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const PRODUCT_CSS = {
  "packages/ui/src/styles/theme.css": "@theme {\n  --color-ink: oklch(0.4 0.1 20);\n}\n",
  "packages/ui/src/styles/globals.css":
    '/* .dead { color: var(--ghost); } */\n.live[data-tone="warm"] {\n  --local-gap: 1rem;\n  content: "--fake: var(--string-only)";\n  color: var(--color-ink);\n}\n',
  "packages/ui/src/styles/tiers.css": "[data-density=compact] { --spacing-row: var(--local-gap, 1rem); }\n",
  "packages/client/src/styles/globals.css": ".client { color: inherit; }\n",
  "packages/client/src/features/app-shell/surfaces/shell.css": ".shell-grid {\n  & .shell-child { display: block; }\n  display: grid;\n}\n",
} as const;

test("the closed CSS inventory publishes positioned selector and variable facts", ({ scratch }) => {
  const host = createResourceHost({ root: scratch, overlay: PRODUCT_CSS }).host;
  const fact = host.cssInventory("product");
  expect(fact).toMatchObject({ status: "ready", members: 24, paths: Object.keys(PRODUCT_CSS) });
  expect(host.cssInventory("product")).toBe(fact);
  if (fact.status !== "ready") {
    throw new Error(`fixture CSS failed: ${fact.reason}`);
  }
  expect(fact.value.selectors).toContainEqual(
    expect.objectContaining({ file: "packages/ui/src/styles/globals.css", line: 2, column: 1, selector: '.live[data-tone="warm"]' }),
  );
  expect(fact.value.selectorHooks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "class", name: "live", file: "packages/ui/src/styles/globals.css", line: 2 }),
      expect.objectContaining({ kind: "data", name: "data-tone", operator: "=", value: "warm", line: 2, column: 6, offset: 42 }),
    ]),
  );
  expect(fact.value.selectors.filter((selector) => selector.file.endsWith("shell.css")).map((selector) => selector.selector)).toEqual([
    ".shell-grid",
    "& .shell-child",
  ]);
  expect(fact.value.customPropertyDefinitions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "--color-ink", file: "packages/ui/src/styles/theme.css", line: 2, column: 3 }),
      expect.objectContaining({ name: "--local-gap", file: "packages/ui/src/styles/globals.css", line: 3, column: 3 }),
    ]),
  );
  expect(fact.value.declarations).toContainEqual(
    expect.objectContaining({
      property: "--color-ink",
      file: "packages/ui/src/styles/theme.css",
      line: 2,
      owner: { kind: "at-rule", prelude: "@theme", line: 1, offset: 0 },
    }),
  );
  expect(fact.value.customPropertyReferences).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "--color-ink", fallback: false, file: "packages/ui/src/styles/globals.css", line: 5 }),
      expect.objectContaining({ name: "--local-gap", fallback: true, file: "packages/ui/src/styles/tiers.css", line: 1 }),
    ]),
  );
  expect(fact.value.customPropertyDefinitions).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "--fake" })]));
  expect(fact.value.customPropertyReferences).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "--ghost" }), expect.objectContaining({ name: "--string-only" })]),
  );
});

test("missing, empty, unresolved, and malformed CSS facts remain distinct", ({ scratch }) => {
  const malformed = createResourceHost({ root: scratch, overlay: { ...PRODUCT_CSS, "packages/ui/src/styles/globals.css": ".x { color: red;\n" } }).host;
  expect(malformed.productCss()).toMatchObject({ status: "malformed", reason: expect.stringContaining("unclosed rule block") });

  for (const status of ["missing", "empty", "unresolved", "malformed"] as const) {
    const corpus = { status, reason: `${status} fixture`, paths: ["packages/ui/src/styles/globals.css"], members: 0 };
    expect(loadCssFacts(corpus)).toBe(corpus);
  }

  const invalidPath = "packages/ui/src/styles/globals.css";
  mkdirSync(dirname(join(scratch, invalidPath)), { recursive: true });
  writeFileSync(join(scratch, invalidPath), Buffer.from([0xc3, 0x28]));
  const validOverlay = Object.fromEntries(Object.entries(PRODUCT_CSS).filter(([path]) => path !== invalidPath));
  expect(createResourceHost({ root: scratch, overlay: validOverlay }).host.productCss()).toMatchObject({
    status: "unresolved",
    reason: expect.stringContaining("utf-8"),
    paths: expect.arrayContaining([invalidPath]),
  });
});
