// @subject tooling/src/floor/compiler/compiler-programs.ts
import type * as Fs from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

const resolved = vi.hoisted((): { paths: string[] } => ({ paths: [] }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  const realpathSync = Object.assign(
    (path: Fs.PathLike, options?: Parameters<typeof real.realpathSync>[1]): string | Buffer => {
      resolved.paths.push(String(path));
      return real.realpathSync(path, options);
    },
    { native: real.realpathSync.native },
  );
  return { ...real, realpathSync };
});

const { readCompilerPrograms } = await import("../../../../tooling/src/floor/compiler/compiler-programs.ts");

const BYSTANDER = "docs/notes.md";

function repository(root: string, programs: number): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(BYSTANDER, "not a compiler member\n");
  for (let index = 0; index < programs; index++) {
    write(`world-${String(index)}/tsconfig.json`, JSON.stringify({ compilerOptions: { noLib: true, types: [] }, include: ["*.ts"] }));
    write(`world-${String(index)}/index.ts`, `export const value${String(index)} = ${String(index)};\n`);
  }
  execFixtureGit(root, ["init", "-q"]);
}

function bystanderResolutions(root: string, programs: number): number {
  repository(root, programs);
  resolved.paths.length = 0;
  expect(readCompilerPrograms(root)).toHaveLength(programs);
  return resolved.paths.filter((path) => path === join(root, BYSTANDER)).length;
}

test("one program-graph read resolves each authored path's physical identity once, not once per program", ({ scratch }) => {
  const single = bystanderResolutions(join(scratch, "single"), 1);
  const many = bystanderResolutions(join(scratch, "many"), 4);
  expect(single).toBeGreaterThan(0);
  expect(many).toBe(single);
});

test("each program-graph read resolves physical identity afresh", ({ scratch }) => {
  const root = join(scratch, "repeat");
  const once = bystanderResolutions(root, 2);
  resolved.paths.length = 0;
  readCompilerPrograms(root);
  expect(resolved.paths.filter((path) => path === join(root, BYSTANDER))).toHaveLength(once);
});
