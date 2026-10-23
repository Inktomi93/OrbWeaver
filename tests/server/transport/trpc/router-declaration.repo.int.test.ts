import { execFileSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";

test("the native client program resolves the router declaration without server implementation", ({ repoRoot }) => {
  const files = execFileSync(
    process.execPath,
    [join(repoRoot, "node_modules/@typescript/native/bin/tsc"), "-p", "packages/client/tsconfig.json", "--listFilesOnly"],
    { cwd: repoRoot, encoding: "utf8" },
  ).split(/\r?\n/u);
  expect(files).toContain(join(repoRoot, "packages/server/dist/router-types/packages/server/src/index.d.ts"));
  expect(files.filter((file) => file.startsWith(join(repoRoot, "packages/server/src/")))).toEqual([]);
});
