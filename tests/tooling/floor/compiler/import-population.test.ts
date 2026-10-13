import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { isImportEntry, selectImportEntries } from "../../../../tooling/src/floor/compiler/import-population.ts";
import { BROWSER_PACKAGES } from "../../../../tooling/src/floor/compiler/project-worlds.ts";

test("native import entries follow browser package homes and browser test kinds outside those homes", () => {
  const authored = [
    "tests/contracts/probe.contract.test.ts",
    "tests/contracts/probe.ct.tsx",
    "tests/contracts/probe.fixtures.tsx",
    "tests/tooling/probe.dom.test.ts",
    "tests/tooling/probe.test.ts",
    "tests/support/browser/probe.ts",
    "playwright/probe.tsx",
    "scripts/browser-probe.tsx",
  ];
  const entries = selectImportEntries(authored);
  expect(authored.filter(isImportEntry)).toEqual([
    "tests/contracts/probe.ct.tsx",
    "tests/contracts/probe.fixtures.tsx",
    "tests/tooling/probe.dom.test.ts",
    "tests/support/browser/probe.ts",
    "playwright/probe.tsx",
    "scripts/browser-probe.tsx",
  ]);
  expect(BROWSER_PACKAGES.size).toBeGreaterThan(0);
  for (const name of BROWSER_PACKAGES) {
    expect(entries).toContain(`tests/${name}`);
    expect(entries).toContain(`tests/legacy/${name}`);
    expect(isImportEntry(`tests/${name}/features/future/_stories.tsx`)).toBe(true);
  }
  expect(entries).toContain("tests/contracts/probe.ct.tsx");
  expect(entries).toContain("tests/contracts/probe.fixtures.tsx");
  expect(entries).not.toContain("tests/contracts/probe.contract.test.ts");
  expect(entries.filter((path) => path === "tests/support/browser")).toHaveLength(1);
});
