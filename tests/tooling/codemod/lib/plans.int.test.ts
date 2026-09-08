// Path containment is physical as well as lexical: symlink ancestry may stay inside the repo, but
// cannot turn an apparently in-repo source or destination into external filesystem I/O.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyFile, createSourceFile, moveFiles } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { withTree } from "../_kit-tree.ts";

test("a move destination through an external directory symlink is refused without writing either tree", async () => {
  const outside = mkdtempSync(join(realpathSync(tmpdir()), "orb-codemod-outside-"));
  const source = "export const a = 1;\n";
  try {
    writeFileSync(join(outside, "sibling.txt"), "keep\n");
    await withTree({ "a.ts": source }, async ({ root, run, read }) => {
      symlinkSync(outside, join(root, "escape"), "dir");

      await expect(run((ctx) => ctx.plan(moveFiles(ctx, [["a.ts", "escape/out.ts"]])), { apply: true })).rejects.toThrow("Path resolves outside repo root");

      expect(read("a.ts")).toBe(source);
      expect(existsSync(join(outside, "out.ts"))).toBe(false);
      expect(readFileSync(join(outside, "sibling.txt"), "utf8")).toBe("keep\n");
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("an existing source reached through an external file symlink is refused", async () => {
  const outside = mkdtempSync(join(realpathSync(tmpdir()), "orb-codemod-source-outside-"));
  try {
    writeFileSync(join(outside, "external.ts"), "export const external = 1;\n");
    await withTree({ "anchor.ts": "export const anchor = 1;\n" }, async ({ root, run }) => {
      symlinkSync(join(outside, "external.ts"), join(root, "external.ts"), "file");

      await expect(run((ctx) => ctx.plan(moveFiles(ctx, [["external.ts", "moved.ts"]])), { apply: true })).rejects.toThrow("Path resolves outside repo root");

      expect(readFileSync(join(outside, "external.ts"), "utf8")).toBe("export const external = 1;\n");
      expect(existsSync(join(root, "moved.ts"))).toBe(false);
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a dangling destination symlink is refused because its physical containment is unknowable", async () => {
  await withTree({ "a.ts": "export const a = 1;\n" }, async ({ root, run, read }) => {
    symlinkSync(join(root, "missing-target"), join(root, "dangling"), "dir");

    await expect(run((ctx) => ctx.plan(createSourceFile(ctx, "dangling/out.ts", "export const out = 1;\n")), { apply: true })).rejects.toThrow(
      "Cannot resolve path containment",
    );

    expect(read("a.ts")).toBe("export const a = 1;\n");
    expect(existsSync(join(root, "missing-target"))).toBe(false);
  });
});

test("an in-repo directory symlink preserves lexical source identity and applies inside the root", async () => {
  await withTree({ "a.ts": "export const a = 1;\n" }, async ({ root, run, read }) => {
    mkdirSync(join(root, "inside"));
    symlinkSync(join(root, "inside"), join(root, "alias"), "dir");

    const { result } = await run((ctx) => ctx.plan(moveFiles(ctx, [["a.ts", "alias/out.ts"]])), { apply: true });

    expect(result.applied).toBe(true);
    expect(read("inside/out.ts")).toBe("export const a = 1;\n");
    expect(() => read("a.ts")).toThrow();
  });
});

const ALIAS_SOURCES = {
  "tests/a.ts": 'export const source = "A";\n',
  "tests/b.ts": 'export const source = "B";\n',
};

function createInternalAlias(root: string): void {
  mkdirSync(join(root, "tests/inside"), { recursive: true });
  symlinkSync(join(root, "tests/inside"), join(root, "tests/alias"), "dir");
}

function expectAliasCollisionLeftDiskUntouched(root: string, read: (relative: string) => string): void {
  expect(read("tests/a.ts")).toBe(ALIAS_SOURCES["tests/a.ts"]);
  expect(read("tests/b.ts")).toBe(ALIAS_SOURCES["tests/b.ts"]);
  expect(existsSync(join(root, "tests/inside/out.ts"))).toBe(false);
}

test("one move batch refuses two lexical destinations that resolve to the same physical file", async () => {
  await withTree(ALIAS_SOURCES, async ({ root, run, read }) => {
    createInternalAlias(root);

    await expect(
      run(
        (ctx) =>
          ctx.plan(
            moveFiles(ctx, [
              ["tests/a.ts", "tests/inside/out.ts"],
              ["tests/b.ts", "tests/alias/out.ts"],
            ]),
          ),
        { apply: true },
      ),
    ).rejects.toThrow("Physical path collision");

    expectAliasCollisionLeftDiskUntouched(root, read);
  });
});

test("separate move plans refuse physical destination aliasing across plan boundaries", async () => {
  await withTree(ALIAS_SOURCES, async ({ root, run, read }) => {
    createInternalAlias(root);

    await expect(
      run(
        (ctx) => {
          ctx.plan(moveFiles(ctx, [["tests/a.ts", "tests/inside/out.ts"]]));
          ctx.plan(moveFiles(ctx, [["tests/b.ts", "tests/alias/out.ts"]]));
        },
        { apply: true },
      ),
    ).rejects.toThrow("Physical path collision");

    expectAliasCollisionLeftDiskUntouched(root, read);
  });
});

test("separate copy plans refuse physical destination aliasing across plan boundaries", async () => {
  await withTree(ALIAS_SOURCES, async ({ root, run, read }) => {
    createInternalAlias(root);

    await expect(
      run(
        (ctx) => {
          ctx.plan(copyFile(ctx, "tests/a.ts", "tests/inside/out.ts"));
          ctx.plan(copyFile(ctx, "tests/b.ts", "tests/alias/out.ts"));
        },
        { apply: true },
      ),
    ).rejects.toThrow("Physical path collision");

    expectAliasCollisionLeftDiskUntouched(root, read);
  });
});

test("separate create plans refuse physical destination aliasing across plan boundaries", async () => {
  await withTree(ALIAS_SOURCES, async ({ root, run, read }) => {
    createInternalAlias(root);

    await expect(
      run(
        (ctx) => {
          ctx.plan(createSourceFile(ctx, "tests/inside/out.ts", 'export const output = "inside";\n'));
          ctx.plan(createSourceFile(ctx, "tests/alias/out.ts", 'export const output = "alias";\n'));
        },
        { apply: true },
      ),
    ).rejects.toThrow("Physical path collision");

    expectAliasCollisionLeftDiskUntouched(root, read);
  });
});

test("repeated plans may edit the same lexical SourceFile", async () => {
  await withTree({ "tests/value.ts": "export const first = 1;\n" }, async ({ root, run, read }) => {
    const file = join(root, "tests/value.ts");
    const { result } = await run(
      (ctx) => {
        ctx.plan({
          description: "second declaration",
          touchedFiles: [file],
          transform(inner): void {
            inner.project.getSourceFileOrThrow(file).addStatements("export const second = 2;\n");
          },
        });
        ctx.plan({
          description: "third declaration",
          touchedFiles: [file],
          transform(inner): void {
            inner.project.getSourceFileOrThrow(file).addStatements("export const third = 3;\n");
          },
        });
      },
      { apply: true },
    );

    expect(result.applied).toBe(true);
    expect(read("tests/value.ts")).toContain("second = 2");
    expect(read("tests/value.ts")).toContain("third = 3");
  });
});

test("an unchanged snapshot through an in-repo alias does not collide with the one changed lexical file", async () => {
  const original = "export const first = 1;\n";
  await withTree({ "tests/inside/value.ts": original }, async ({ root, run, read }) => {
    symlinkSync(join(root, "tests/inside"), join(root, "tests/alias"), "dir");
    const changed = join(root, "tests/inside/value.ts");
    const unchangedAlias = join(root, "tests/alias/value.ts");

    const { result } = await run(
      (ctx) =>
        ctx.plan({
          description: "declare a wider review set than the actual edit",
          touchedFiles: [changed, unchangedAlias],
          transform(inner): void {
            inner.project.getSourceFileOrThrow(changed).addStatements("export const second = 2;\n");
          },
        }),
      { apply: true },
    );

    expect(result.applied).toBe(true);
    expect(read("tests/inside/value.ts")).toContain("second = 2");
  });
});

test("ordinary unborn in-repo directories remain valid destinations", async () => {
  await withTree({ "anchor.ts": "export const anchor = 1;\n" }, async ({ run, read }) => {
    const { result } = await run((ctx) => ctx.plan(createSourceFile(ctx, "created/deep/value.ts", "export const value = 1;\n")), { apply: true });

    expect(result.applied).toBe(true);
    expect(read("created/deep/value.ts")).toBe("export const value = 1;\n");
  });
});
