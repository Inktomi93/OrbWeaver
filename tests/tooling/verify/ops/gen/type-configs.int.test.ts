import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { deriveTypeConfigFiles } from "../../../../../tooling/src/verify/ops/gen/type-configs.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

// Keep filesystem access native while reproducing Windows arithmetic over authored config paths.
vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return {
    ...actual,
    dirname: actual.win32.dirname,
    relative: actual.win32.relative,
    join: (...paths: string[]) => (paths[0] === "/" ? actual.win32.join(...paths) : actual.join(...paths)),
  };
});

test("Windows path arithmetic cannot change committed TypeScript config roots", ({ scratch }) => {
  writeFileSync(join(scratch, "tsconfig.base.json"), JSON.stringify({ compilerOptions: { lib: ["es2025"] } }));
  const files = deriveTypeConfigFiles(scratch);
  for (const text of Object.values(files)) {
    expect(text).not.toContain("\\");
  }
  expect(JSON.parse(files["packages/ui/tsconfig.json"] ?? "null")).toMatchObject({
    include: ["src", "../../reset.d.ts", "../../platform.d.ts", "src/markdown/css-modules.d.ts"],
  });
  expect(JSON.parse(files["tooling/tsconfig.json"] ?? "null")).toMatchObject({ include: ["src", "../reset.d.ts", "../platform.d.ts"] });
});
