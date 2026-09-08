// Apply materializes directories only after every planned parent topology is known-valid, and owns
// only the exact empty directories it created if a later mkdir fails.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSourceFile } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { withTree } from "../_kit-tree.ts";

test("a regular-file parent refuses the whole batch before any directory or file is created", async () => {
  await withTree({ "tests/anchor.ts": "export const anchor = 1;\n", "tests/blocked": "parent is a file\n" }, async ({ root, run }) => {
    await expect(
      run(
        (ctx) => {
          ctx.plan(createSourceFile(ctx, "tests/created/first.ts", "export const first = 1;\n"));
          ctx.plan(createSourceFile(ctx, "tests/blocked/sub/second.ts", "export const second = 2;\n"));
        },
        { apply: true },
      ),
    ).rejects.toThrow("is not a directory");

    expect(existsSync(join(root, "tests/created"))).toBe(false);
    expect(existsSync(join(root, "tests/created/first.ts"))).toBe(false);
    expect(existsSync(join(root, "tests/blocked/sub/second.ts"))).toBe(false);
    expect(readFileSync(join(root, "tests/blocked"), "utf8")).toBe("parent is a file\n");
  });
});

test("a later mkdir failure removes only this run's empty parents and preserves existing siblings", async () => {
  await withTree({ "tests/anchor.ts": "export const anchor = 1;\n" }, async ({ root, run }) => {
    const locked = join(root, "tests/locked");
    mkdirSync(locked);
    writeFileSync(join(locked, "sibling.txt"), "keep\n");
    chmodSync(locked, 0o500);
    try {
      await expect(
        run(
          (ctx) => {
            ctx.plan(createSourceFile(ctx, "tests/created/first.ts", "export const first = 1;\n"));
            ctx.plan(createSourceFile(ctx, "tests/locked/sub/second.ts", "export const second = 2;\n"));
          },
          { apply: true },
        ),
      ).rejects.toThrow();
    } finally {
      chmodSync(locked, 0o700);
    }

    expect(existsSync(join(root, "tests/created"))).toBe(false);
    expect(existsSync(join(root, "tests/created/first.ts"))).toBe(false);
    expect(existsSync(join(root, "tests/locked/sub/second.ts"))).toBe(false);
    expect(readFileSync(join(locked, "sibling.txt"), "utf8")).toBe("keep\n");
  });
});
