// Self-test for the kit's MOVE primitive (tooling/src/codemod/lib/files.ts `moveFiles`).
//
// Two defects paid for by the #1010 roster rename (three dry-run iterations before it applied), each
// papered over by a hand-rolled Plan inside the one-shot script rather than fixed in the kit:
//
//   #1778 — after `SourceFile.move()`, `project.getSourceFile(<old path>)` still answers with a
//           PHANTOM carrying the file's pre-move text. The harness's pre-emit diagnostics check scans
//           it (the old path is declared, so it is in the snapshot set), counts its now-genuinely-stale
//           errors as "the codemod produced broken code", and REFUSES the apply. The operator sees a
//           codemod that can never be applied and no hint why.
//
//           HONESTY NOTE, and it decides how to read the first describe block below: the phantom is a
//           REAL-SCALE-ONLY behaviour. It was reproduced on the actual repo project (6,147 files, three
//           real moves: `getSourceFile(<old abs path>)` answered at the OLD path after `move()`), and it
//           does NOT reproduce at fixture scale — seven fixture arms (plain move · language-service
//           rename then move · diagnostics between move and check · two files moving together · an
//           unrewritable string referrer · a tsconfig-`paths` alias referrer · a chained A→B/B→C move)
//           all answered NONE. So the tests in that block are a FENCE, not a defect proof: they passed
//           against the unmodified kit too. They exist to keep the one-pass apply true, and the fix they
//           guard is proved by the real-scale probe, not by them. #1781's tests below ARE red-first —
//           all three failed against the unmodified kit.
//
//   #1781a — ts-morph recomputes a moved module's relative specifiers WITHOUT an extension
//           (`"./verbs/participants"`). That is green under the ROOT program (bundler resolution =
//           `types:graph`) and RED under the per-package `node16` program (TS2835) plus biome's
//           `useImportExtensions` — a lane whose floor named only one type program ships it.
//
// Both are asserted through the operator-visible surface: does the apply go through in ONE pass, and
// what BYTES are on disk afterwards. Neither assertion reaches into kit internals.

import { describe } from "vitest";
import { moveFiles, renameExportedSymbol } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { withTree } from "../_kit-tree.ts";

describe("moveFiles leaves no phantom at the vacated path (#1778)", () => {
  // The tree the roster rename hit: a symbol is renamed, THEN its consumer moves. The phantom holds
  // the consumer's ORIGINAL text — which imports the pre-rename name that no longer exists — so the
  // pre-emit check sees a hard TS2305 at a path the apply is about to delete.
  const renameThenMove = {
    "lib.ts": "export function oldFoo(): number {\n  return 1;\n}\n",
    "user.ts": 'import { oldFoo } from "./lib.ts";\n\nexport const used = oldFoo();\n',
  };

  test("a rename + move applies in ONE pass with the diagnostics check ON", async () => {
    await withTree(
      renameThenMove,
      async ({ run, read }) => {
        const { result } = await run(
          (ctx) => {
            ctx.plan(renameExportedSymbol(ctx, "lib.ts", { oldName: "oldFoo", newName: "newFoo" }));
            ctx.plan(moveFiles(ctx, [["user.ts", "sub/user.ts"]]));
          },
          { apply: true },
        );
        expect(result.applied).toBe(true);
        expect(result.diagnosticErrors).toBe(0);
        expect(read("sub/user.ts")).toContain("newFoo");
        expect(() => read("user.ts")).toThrow();
      },
      { skipDiagnosticsCheck: false },
    );
  });

  // POSITIVE CONTROL for the assertion above: the diagnostics check is genuinely armed in this tree,
  // so "0 diagnostics" is a measurement and not a disabled guard. A codemod that leaves a REAL error
  // in a moved file still refuses.
  test("the diagnostics check is armed — a move that really does break the code still refuses", async () => {
    await withTree(
      renameThenMove,
      async ({ run, read }) => {
        const attempt = run(
          (ctx) => {
            ctx.plan(moveFiles(ctx, [["user.ts", "sub/user.ts"]]));
            ctx.plan({
              description: "break the moved file on purpose",
              touchedFiles: ["sub/user.ts"],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(`${inner.repoRoot}/sub/user.ts`).addStatements("export const broken: number = oldFoo(1, 2, 3);\n");
              },
            });
          },
          { apply: true },
        );
        await expect(attempt).rejects.toThrow("Refused to apply");
        expect(read("user.ts")).toBe(renameThenMove["user.ts"]);
      },
      { skipDiagnosticsCheck: false },
    );
  });
});

describe("moveFiles keeps the explicit file extension on every specifier it rewrites (#1781)", () => {
  const threeDeep = {
    "lib.ts": "export const lib = 1;\n",
    "user.ts": 'import { lib } from "./lib.ts";\n\nexport const user = lib + 1;\n',
    "main.ts": 'import { user } from "./user.ts";\n\nexport const main = user + 1;\n',
  };

  test("the moved file's OWN outgoing specifier keeps its .ts", async () => {
    await withTree(threeDeep, async ({ run, read }) => {
      await run((ctx) => ctx.plan(moveFiles(ctx, [["user.ts", "sub/user.ts"]])), { apply: true });
      expect(read("sub/user.ts")).toContain('from "../lib.ts"');
    });
  });

  test("an IMPORTER's specifier pointing at the moved file keeps its .ts", async () => {
    await withTree(threeDeep, async ({ run, read }) => {
      await run((ctx) => ctx.plan(moveFiles(ctx, [["user.ts", "sub/user.ts"]])), { apply: true });
      expect(read("main.ts")).toContain('from "./sub/user.ts"');
    });
  });

  test("a .tsx move keeps .tsx, and an already-extensionless specifier is left alone", async () => {
    // The extension is READ OFF the resolved file, never assumed to be `.ts`; and a codebase that
    // imports extensionlessly on purpose must not be "fixed" by a move.
    await withTree(
      {
        "widget.tsx": "export const Widget = 1;\n",
        "page.ts": 'import { Widget } from "./widget.tsx";\n\nexport const page = Widget;\n',
        "bare.ts": "export const bare = 1;\n",
        "bare-user.ts": 'import { bare } from "./bare";\n\nexport const bareUser = bare;\n',
      },
      async ({ run, read }) => {
        await run(
          (ctx) => {
            ctx.plan(moveFiles(ctx, [["widget.tsx", "sub/widget.tsx"]]));
          },
          { apply: true },
        );
        expect(read("page.ts")).toContain('from "./sub/widget.tsx"');
        expect(read("bare-user.ts")).toContain('from "./bare"');
      },
    );
  });
});
