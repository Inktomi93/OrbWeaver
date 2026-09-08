// Native-loader proof for config-snapshot: executable Vitest config is observed after functions, imports,
// and derived arrays resolve, while absent optional fields remain absence and malformed selectors refuse.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createVitest } from "vitest/node";
import { snapshotVitestConfig } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CONFIG_REL = "vitest.config.ts";

async function plant(root: string, source: string): Promise<void> {
  await writeFile(join(root, CONFIG_REL), source, "utf8");
}

test("loads an async Vitest config and preserves derived selector owner/field identities", async ({ scratch }) => {
  await plant(
    scratch,
    `const suffixes = [".test.ts", ".dom.test.ts"];
export default async () => ({
  test: {
    exclude: ["reports/**"],
    projects: [
      { test: { name: "unit", include: suffixes.map((suffix) => \`tests/**/*\${suffix}\`) } },
      { test: { exclude: ["tests/tooling/**"] } },
    ],
  },
});
`,
  );

  const snapshot = await snapshotVitestConfig(scratch, CONFIG_REL);

  expect(snapshot.selectors).toContainEqual({
    owner: "project[0]:unit",
    field: "test.include",
    values: ["tests/**/*.test.ts", "tests/**/*.dom.test.ts"],
  });
  expect(snapshot.selectors).toContainEqual({ owner: "project[1]", field: "test.exclude", values: ["tests/tooling/**"] });
  expect(snapshot.selectors).not.toContainEqual(expect.objectContaining({ owner: "project[1]", field: "test.include" }));
});

test("refuses a selector that the native loader resolves to a non-string array", async ({ scratch }) => {
  await plant(scratch, "export default { test: { projects: [{ test: { include: [42] } }] } };\n");

  await expect(snapshotVitestConfig(scratch, CONFIG_REL)).rejects.toThrow("project[0].test.include resolved to a non-string-array selector");
});

test("Vitest natively collects exact files, not empty or directory includes, while a directory exclude is recursive", async ({ scratch }) => {
  await mkdir(join(scratch, "tests/excluded"), { recursive: true });
  await writeFile(join(scratch, "tests/live.test.ts"), "export const live = 1;\n", "utf8");
  await writeFile(join(scratch, "tests/excluded/hidden.test.ts"), "export const hidden = 1;\n", "utf8");
  await plant(
    scratch,
    `export default { test: { projects: [
  { test: { name: "empty", include: [""] } },
  { test: { name: "directory", include: ["tests"] } },
  { test: { name: "exact", include: ["tests/live.test.ts"] } },
  { test: { name: "exclude-directory", include: ["tests/**/*.test.ts"], exclude: ["tests/excluded"] } },
] } };\n`,
  );

  const vitest = await createVitest("test", { root: scratch, config: CONFIG_REL, run: true, watch: false });
  try {
    const collected = new Map<string, readonly string[]>();
    for (const project of vitest.projects) {
      collected.set(project.name, (await project.globTestFiles()).testFiles);
    }
    expect(collected.get("empty")).toEqual([]);
    expect(collected.get("directory")).toEqual([]);
    expect(collected.get("exact")).toEqual([join(scratch, "tests/live.test.ts")]);
    expect(collected.get("exclude-directory")).toEqual([join(scratch, "tests/live.test.ts")]);
  } finally {
    await vitest.close();
  }
});

test("Vitest accepts a globalSetup directory and executes its index module", async ({ scratch }) => {
  const marker = join(scratch, "global-setup-ran");
  await mkdir(join(scratch, "tests/setup"), { recursive: true });
  await writeFile(
    join(scratch, "tests/setup/index.ts"),
    `import { writeFileSync } from "node:fs";\nexport function setup() { writeFileSync(${JSON.stringify(marker)}, "ran"); }\n`,
    "utf8",
  );
  await writeFile(join(scratch, "tests/live.test.ts"), 'import { expect, test } from "vitest";\ntest("live", () => expect(1).toBe(1));\n', "utf8");
  await plant(scratch, 'export default { test: { include: ["tests/live.test.ts"], globalSetup: ["tests/setup"], reporters: [] } };\n');

  const vitest = await createVitest("test", { root: scratch, config: CONFIG_REL, run: true, watch: false, reporters: [] });
  try {
    await vitest.start();
    expect(existsSync(marker)).toBe(true);
  } finally {
    await vitest.close();
  }
});
