// `repointAliasPaths` (tooling/src/codemod/lib/imports.ts) — the alias-path sweep.
//
// #1781b: it declared EVERY project file as `touchedFiles`. The declared set is what the harness
// snapshots AND what its pre-emit diagnostics filter narrows to, so one call widened that filter from
// a change's ~50 files to the whole workspace and buried the codemod's own signal under thousands of
// pre-existing unrelated errors. That is why the #1010 roster rename hand-rolled its own extension
// plan instead of calling this helper — the workaround the kit fix exists to retire.
//
// Asserted through the operator-visible preview: which files the plan says it touched.

import { describe } from "vitest";
import { repointAliasPaths } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { withTree } from "../_kit-tree.ts";

const fourFiles = {
  "hit-one.ts": 'import { x } from "#old/x.ts";\n\nexport const one = x;\n',
  "hit-two.ts": 'import { x } from "#old/x.ts";\n\nexport const two = x;\n',
  "miss-one.ts": "export const missOne = 1;\n",
  "miss-two.ts": "export const missTwo = 2;\n",
};

describe("repointAliasPaths declares only what it rewrites (#1781)", () => {
  test("the preview lists the two matching files and neither of the two that do not match", async () => {
    await withTree(fourFiles, async ({ run }) => {
      const { result, output } = await run((ctx) => {
        ctx.plan(repointAliasPaths(ctx, [[/#old\/x\.ts/gu, "#new/x.ts"]]));
      });
      expect(result.filesChanged).toBe(2);
      expect(output).toContain("~ hit-one.ts");
      expect(output).toContain("~ hit-two.ts");
      expect(output).not.toContain("miss-one.ts");
      expect(output).not.toContain("miss-two.ts");
      // The count rides in the description, so an operator reading the preview sees the blast radius
      // without counting lines.
      expect(output).toContain("Alias-path sweep (1 pattern, 2 files)");
    });
  });

  test("a sweep that matches nothing declares nothing and changes nothing", async () => {
    await withTree(fourFiles, async ({ run }) => {
      const { result, output } = await run((ctx) => {
        ctx.plan(repointAliasPaths(ctx, [[/#absent\/y\.ts/gu, "#new/y.ts"]]));
      });
      expect(result.filesChanged).toBe(0);
      expect(output).toContain("Alias-path sweep (1 pattern, 0 files)");
    });
  });

  test("the rewrite still lands on disk under --apply", async () => {
    // POSITIVE CONTROL for the narrowing above: a plan that declares fewer files must still DO the work.
    await withTree(fourFiles, async ({ run, read }) => {
      await run(
        (ctx) => {
          ctx.plan(repointAliasPaths(ctx, [[/#old\/x\.ts/gu, "#new/x.ts"]]));
        },
        { apply: true },
      );
      expect(read("hit-one.ts")).toContain('"#new/x.ts"');
      expect(read("miss-one.ts")).toBe(fourFiles["miss-one.ts"]);
    });
  });
});
