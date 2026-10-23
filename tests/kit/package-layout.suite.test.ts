// No package src root holds a loose module: every importable module is a directory with an index.ts front door.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node";

const REPOSITORY = join(import.meta.dirname, "../..");
const PACKAGES = ["kit", "contracts", "client", "db", "ui", "inference"] as const;

/** Loose root `.ts` files as `package/file`. The inference package's injected-dependency seam, `deps.ts`, is the one sanctioned file. */
function looseModules(filePaths: readonly string[]): readonly string[] {
  return filePaths.flatMap((path) => {
    const [packages, packageName, src, file, ...rest] = path.split("/");
    const sanctioned = packageName === "inference" && file === "deps.ts";
    return packages === "packages" &&
      packageName !== undefined &&
      (PACKAGES as readonly string[]).includes(packageName) &&
      src === "src" &&
      file !== undefined &&
      rest.length === 0 &&
      file !== "index.ts" &&
      !sanctioned &&
      file.endsWith(".ts")
      ? [`${packageName}/${file}`]
      : [];
  });
}

function srcRootFiles(packageName: string): readonly string[] {
  return readdirSync(join(REPOSITORY, "packages", packageName, "src"), { withFileTypes: true })
    .filter((dirent) => !dirent.isDirectory())
    .map((dirent) => `packages/${packageName}/src/${dirent.name}`);
}

test("no package src root holds a loose module", () => {
  const roots = PACKAGES.flatMap(srcRootFiles);
  expect(roots).toContain("packages/inference/src/deps.ts");
  expect(roots).toContain("packages/kit/src/index.ts");
  expect(looseModules(roots)).toEqual([]);
});

test("a loose module is reported in inference and kit", () => {
  expect(looseModules(["packages/inference/src/loose.ts"])).toEqual(["inference/loose.ts"]);
  expect(looseModules(["packages/kit/src/loose.ts"])).toEqual(["kit/loose.ts"]);
});

test("deps.ts is sanctioned for inference only", () => {
  expect(looseModules(["packages/kit/src/deps.ts"])).toEqual(["kit/deps.ts"]);
  expect(looseModules(["packages/inference/src/index.ts", "packages/inference/src/deps.ts"])).toEqual([]);
});

test("index.ts and a module directory are the sanctioned layout", () => {
  expect(looseModules(["packages/kit/src/index.ts", "packages/kit/src/mod/index.ts"])).toEqual([]);
});
