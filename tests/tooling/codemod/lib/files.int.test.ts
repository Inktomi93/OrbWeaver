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

import { join } from "node:path";
import { describe } from "vitest";
import { moveFiles, renameExportedSymbol } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { withTree } from "../_kit-tree.ts";

describe("moveFiles leaves no phantom at the vacated path (#1778)", () => {
  // The tree the roster rename hit: a symbol is renamed, THEN its consumer moves. The phantom holds
  // the consumer's ORIGINAL text — which imports the pre-rename name that no longer exists — so the
  // pre-emit check sees a hard TS2305 at a path the apply is about to delete.
  const renameThenMove = {
    "tests/lib.ts": "export function oldFoo(): number {\n  return 1;\n}\n",
    "tests/user.ts": 'import { oldFoo } from "./lib.ts";\n\nexport const used = oldFoo();\n',
  };

  test("a rename + move applies in ONE pass with the diagnostics check ON", async () => {
    await withTree(
      renameThenMove,
      async ({ run, read }) => {
        const { result } = await run(
          (ctx) => {
            ctx.plan(renameExportedSymbol(ctx, "tests/lib.ts", { oldName: "oldFoo", newName: "newFoo" }));
            ctx.plan(moveFiles(ctx, [["tests/user.ts", "tests/sub/user.ts"]]));
          },
          { apply: true },
        );
        expect(result.applied).toBe(true);
        expect(result.diagnosticErrors).toBe(0);
        expect(read("tests/sub/user.ts")).toContain("newFoo");
        expect(() => read("tests/user.ts")).toThrow();
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
            ctx.plan(moveFiles(ctx, [["tests/user.ts", "tests/sub/user.ts"]]));
            ctx.plan({
              description: "break the moved file on purpose",
              touchedFiles: ["sub/user.ts"],
              transform(inner): void {
                inner.project.getSourceFileOrThrow(`${inner.repoRoot}/tests/sub/user.ts`).addStatements("export const broken: number = oldFoo(1, 2, 3);\n");
              },
            });
          },
          { apply: true },
        );
        await expect(attempt).rejects.toThrow("Refused to apply");
        expect(read("tests/user.ts")).toBe(renameThenMove["tests/user.ts"]);
        expect(() => read("tests/sub/user.ts")).toThrow();
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

  test("batch moves preserve resolved import/export/dynamic/import-type identities and the caller's extension convention", async () => {
    await withTree(
      {
        "value.ts": "export const value = 1;\nexport interface Shape { readonly n: number }\n",
        "pkg/index.ts": "export const indexed = 2;\n",
        "pair/a.ts": 'import { b } from "./b.ts";\nexport const a = b + 1;\n',
        "pair/b.ts": "export const b = 1;\n",
        "split-pair/a.ts": 'import { b } from "./b.ts";\nexport const a = b + 1;\n',
        "split-pair/b.ts": "export const b = 1;\n",
        "consumer.ts":
          'import { value } from "./value.js";\n' +
          'export { value as again } from "./value.ts";\n' +
          'export type Imported = import("./value.ts").Shape;\n' +
          'export const dynamic = () => import("./value.ts");\n' +
          'import { indexed } from "./pkg";\n' +
          "export const total = value + indexed;\n",
      },
      async ({ run, read, root }) => {
        let heldPath = "";
        let valueReferences: readonly string[] = [];
        let indexReferences: readonly string[] = [];
        let pairReferences: readonly string[] = [];
        let splitPairReferences: readonly string[] = [];
        await run(
          (ctx) => {
            const held = ctx.project.getSourceFileOrThrow(join(root, "value.ts"));
            ctx.plan(
              moveFiles(ctx, [
                ["value.ts", "moved/value.ts"],
                ["pkg/index.ts", "new-pkg/index.ts"],
                ["pair/a.ts", "moved-pair/a.ts"],
                ["pair/b.ts", "moved-pair/b.ts"],
                ["split-pair/a.ts", "moved-a/a.ts"],
                ["split-pair/b.ts", "moved-b/b.ts"],
              ]),
            );
            heldPath = held.getFilePath();
            valueReferences = ctx.project
              .getSourceFileOrThrow(join(root, "moved/value.ts"))
              .getReferencingLiteralsInOtherSourceFiles()
              .map((literal) => literal.getLiteralText())
              .toSorted();
            indexReferences = ctx.project
              .getSourceFileOrThrow(join(root, "new-pkg/index.ts"))
              .getReferencingLiteralsInOtherSourceFiles()
              .map((literal) => literal.getLiteralText());
            pairReferences = ctx.project
              .getSourceFileOrThrow(join(root, "moved-pair/b.ts"))
              .getReferencingLiteralsInOtherSourceFiles()
              .map((literal) => literal.getLiteralText());
            splitPairReferences = ctx.project
              .getSourceFileOrThrow(join(root, "moved-b/b.ts"))
              .getReferencingLiteralsInOtherSourceFiles()
              .map((literal) => literal.getLiteralText());
          },
          { apply: true },
        );
        const consumer = read("consumer.ts");
        expect(consumer).toContain('from "./moved/value.js"');
        expect(consumer).toContain('from "./moved/value.ts"');
        expect(consumer).toContain('import("./moved/value.ts")');
        expect(consumer).toContain('from "./new-pkg/index"');
        expect(heldPath).toBe(join(root, "moved/value.ts"));
        expect(valueReferences).toEqual(["./moved/value.js", "./moved/value.ts", "./moved/value.ts", "./moved/value.ts"]);
        expect(indexReferences).toEqual(["./new-pkg/index"]);
        expect(read("moved-pair/a.ts")).toContain('from "./b.ts"');
        expect(pairReferences).toEqual(["./b.ts"]);
        expect(read("moved-a/a.ts")).toContain('from "../moved-b/b.ts"');
        expect(splitPairReferences).toEqual(["../moved-b/b.ts"]);
      },
    );
  });

  test("a moving owner keeps its resolved target when the final spelling names an old-tree decoy", async () => {
    await withTree(
      {
        "tests/old/sub/owner.ts": 'import { target } from "../../x/target.ts";\nexport const value = target;\n',
        "tests/x/target.ts": "export const target = 'actual';\n",
        // Same export shape on purpose: a wrong retarget remains type-correct, so diagnostics cannot
        // rescue this identity assertion.
        "tests/old/x/target.ts": "export const target = 'decoy';\n",
      },
      async ({ run, read, root }) => {
        let actualReferences: readonly string[] = [];
        let decoyReferences: readonly string[] = [];
        await run(
          (ctx) => {
            ctx.plan(moveFiles(ctx, [["tests/old/sub/owner.ts", "tests/new/owner.ts"]]));
            actualReferences = ctx.project
              .getSourceFileOrThrow(join(root, "tests/x/target.ts"))
              .getReferencingLiteralsInOtherSourceFiles()
              .map((literal) => literal.getLiteralText());
            decoyReferences = ctx.project
              .getSourceFileOrThrow(join(root, "tests/old/x/target.ts"))
              .getReferencingLiteralsInOtherSourceFiles()
              .map((literal) => literal.getLiteralText());
          },
          { apply: true },
        );
        expect(read("tests/new/owner.ts")).toContain('from "../x/target.ts"');
        expect(actualReferences).toEqual(["../x/target.ts"]);
        expect(decoyReferences).toEqual([]);
      },
      { skipDiagnosticsCheck: false },
    );
  });

  test("invalid move graphs refuse before mutation", async () => {
    await withTree(
      {
        "a.ts": "export const a = 1;\n",
        "b.ts": "export const b = 2;\n",
      },
      async ({ run, read }) => {
        await expect(
          run((ctx) => {
            ctx.plan(moveFiles(ctx, [["a.ts", "a.ts"]]));
          }),
        ).rejects.toThrow("source and destination are the same");
        await expect(
          run((ctx) => {
            ctx.plan(
              moveFiles(ctx, [
                ["a.ts", "out.ts"],
                ["b.ts", "out.ts"],
              ]),
            );
          }),
        ).rejects.toThrow("duplicate destination");
        await expect(
          run((ctx) => {
            ctx.plan(
              moveFiles(ctx, [
                ["a.ts", "one.ts"],
                ["a.ts", "two.ts"],
              ]),
            );
          }),
        ).rejects.toThrow("duplicate source");
        await expect(
          run((ctx) => {
            ctx.plan(moveFiles(ctx, [["a.ts", "b.ts"]]));
          }),
        ).rejects.toThrow("destination already exists");
        await expect(
          run((ctx) => {
            ctx.plan(moveFiles(ctx, [["a.ts", "../escaped.ts"]]));
          }),
        ).rejects.toThrow("Path escapes repo root");
        expect(read("a.ts")).toBe("export const a = 1;\n");
        expect(read("b.ts")).toBe("export const b = 2;\n");
      },
    );
    await withTree(
      {
        "unresolved.ts": 'import { missing } from "./missing.ts";\nexport const value = missing;\n',
      },
      async ({ run, read }) => {
        await expect(
          run((ctx) => {
            ctx.plan(moveFiles(ctx, [["unresolved.ts", "sub/unresolved.ts"]]));
          }),
        ).rejects.toThrow("unresolved relative module specifier");
        expect(read("unresolved.ts")).toContain('from "./missing.ts"');
      },
    );
  });
});
