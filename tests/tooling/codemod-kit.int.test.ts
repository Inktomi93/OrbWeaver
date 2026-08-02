// Self-test for the codemod harness's PREVIEW INTEGRITY (scripts/codemods/codemod-kit.ts §4/§5).
//
// The defect this pins (hit live 2026-08-03): a Plan that under-declares its `touchedFiles` had its
// edits to the undeclared files captured as the "original" snapshot — so those edits rendered as
// UNCHANGED (i.e. not at all) in the dry-run preview and the diff summary. The operator reviewed a
// preview that omitted real changes, then applied. Silent errors are a no-go; a preview that lies is
// worse than no preview.
//
// The law under test (§5 `Plan.touchedFiles`): every file a plan mutates must be declared — in
// `touchedFiles`, or via `ctx.snapshot(sf)` from inside the transform BEFORE the mutation (the seam
// for a blast radius only knowable at transform time: `move()`'s importer rewrites, the language
// service's rename set). Anything else aborts the run with a CodemodError naming the files + the
// offending plan. Every assertion here goes through the operator-visible surface — the thrown error
// and the rendered preview text — never through harness internals.
//
// Fixtures are REAL temp trees (the harness bootstraps a real ts-morph Project from a tsconfig and
// saveSync()s to disk on --apply), rooted outside the repo and removed in `finally`.

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, vi } from "vitest";
import type { CodemodContext, CodemodResult, Plan, RunCodemodOptions } from "../../scripts/codemods/codemod-kit.ts";
import { applyTextReplacements, composePlans, deleteFiles, moveFiles, renameExportedSymbol, runCodemod } from "../../scripts/codemods/codemod-kit.ts";
import { expect, test } from "../support/fixtures.ts";

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true },
});

interface Harness {
  readonly root: string;
  /** Run the codemod against this tree. Dry-run unless `apply` is set. Returns the result plus every
   *  line the harness printed — the preview IS the operator-visible surface. */
  readonly run: (
    codemod: (ctx: CodemodContext) => void,
    opts?: { readonly apply?: boolean },
  ) => Promise<{ readonly result: CodemodResult; readonly output: string }>;
  /** Current on-disk text (to prove a refusal wrote nothing). */
  readonly read: (rel: string) => string;
}

/** Materialize `files` into a fresh temp tree with a tsconfig, hand a harness to `fn`, then remove it. */
async function withTree(files: Record<string, string>, fn: (h: Harness) => Promise<void>): Promise<void> {
  // realpath: macOS/Linux tmpdir can be a symlink, and the kit's `absolutePath` repo-escape guard
  // compares resolved paths — an unresolved root makes every fixture path look like it escapes.
  const root = mkdtempSync(join(realpathSync(tmpdir()), "orb-codemod-kit-"));
  try {
    writeFileSync(join(root, "tsconfig.json"), TSCONFIG);
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    const options: RunCodemodOptions = {
      setup: { tsConfigFilePath: join(root, "tsconfig.json"), replaceGlobs: [`${root}/**/*.ts`] },
      repoRoot: root,
      // The fixtures are deliberately tiny and sometimes mid-refactor; the pre-emit check is a
      // different guard with its own behaviour, and it would drown this one's signal.
      skipDiagnosticsCheck: true,
      maxOutputLines: 10_000,
    };
    await fn({
      root,
      read: (rel) => readFileSync(join(root, rel), "utf-8"),
      async run(codemod, runOpts = {}) {
        const lines: string[] = [];
        const collect = (...args: unknown[]): void => {
          lines.push(args.map(String).join(" "));
        };
        const log = vi.spyOn(console, "log").mockImplementation(collect);
        const error = vi.spyOn(console, "error").mockImplementation(collect);
        try {
          const result = await runCodemod("preview-integrity-fixture", codemod, {
            ...options,
            ...(runOpts.apply === true ? { forceApply: true } : {}),
          });
          return { result, output: lines.join("\n") };
        } finally {
          log.mockRestore();
          error.mockRestore();
        }
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A hand-written plan in the shape a codemod author writes one: declares `declares`, edits `edits`. */
function handPlan(opts: { description: string; declares: readonly string[]; edits: readonly string[]; text?: string }): Plan {
  return {
    description: opts.description,
    touchedFiles: [...opts.declares],
    transform(ctx): void {
      for (const rel of opts.edits) {
        const sf = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, rel));
        sf.insertText(0, opts.text ?? "// edited by the plan\n");
      }
    },
  };
}

// The rendered "Files" line for a one-line insertion, verbatim (the preview pads the path with 4
// spaces). Asserting the rendered bytes is the point: this suite exists because the preview lied.
const ONE_LINE_ADDED = "2 → 3 lines (+1/-0), first change at line 1";
/** Both undeclared files, in the refusal's sorted order. */
const BOTH_UNDECLARED_IN_ORDER = /b\.ts[\s\S]*c\.ts/u;

const TWO_FILES = {
  "a.ts": "export const a = 1;\n",
  "b.ts": "export const b = 2;\n",
};

describe("the undeclared-mutation refusal", () => {
  test("a plan that edits a file it never declared is REFUSED, naming the file and the plan", async () => {
    await withTree(TWO_FILES, async ({ run }) => {
      const attempt = run((ctx) => {
        ctx.plan(handPlan({ description: "under-declaring plan", declares: ["a.ts"], edits: ["a.ts", "b.ts"] }));
      });
      await expect(attempt).rejects.toThrow("Undeclared file mutation");
      await expect(attempt).rejects.toThrow("under-declaring plan");
      await expect(attempt).rejects.toThrow("b.ts");
    });
  });

  test("the refusal names EVERY undeclared file, not just the first", async () => {
    await withTree({ ...TWO_FILES, "c.ts": "export const c = 3;\n" }, async ({ run }) => {
      const attempt = run((ctx) => {
        ctx.plan(handPlan({ description: "sweep", declares: ["a.ts"], edits: ["a.ts", "b.ts", "c.ts"] }));
      });
      await expect(attempt).rejects.toThrow("changed 2 file(s) it never declared");
      await expect(attempt).rejects.toThrow(BOTH_UNDECLARED_IN_ORDER);
    });
  });

  test("refusal precedes the write: --apply leaves the undeclared file's bytes untouched on disk", async () => {
    await withTree(TWO_FILES, async ({ run, read }) => {
      await expect(
        run(
          (ctx) => {
            ctx.plan(handPlan({ description: "under-declaring plan", declares: ["a.ts"], edits: ["a.ts", "b.ts"] }));
          },
          { apply: true },
        ),
      ).rejects.toThrow("Undeclared file mutation");
      expect(read("a.ts")).toBe(TWO_FILES["a.ts"]);
      expect(read("b.ts")).toBe(TWO_FILES["b.ts"]);
    });
  });

  test("a composed plan is held to the UNION of its parts — the refusal names the composed label", async () => {
    await withTree(TWO_FILES, async ({ run }) => {
      const attempt = run((ctx) => {
        ctx.plan(
          composePlans("composed: touch a + b", [
            handPlan({ description: "part 1", declares: ["a.ts"], edits: ["a.ts"] }),
            handPlan({ description: "part 2", declares: [], edits: ["b.ts"] }),
          ]),
        );
      });
      await expect(attempt).rejects.toThrow("composed: touch a + b");
      await expect(attempt).rejects.toThrow("b.ts");
    });
  });

  test("a codemod body that mutates the project outside any plan is refused too", async () => {
    await withTree(TWO_FILES, async ({ run }) => {
      const attempt = run((ctx) => {
        ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "b.ts")).insertText(0, "// direct\n");
      });
      await expect(attempt).rejects.toThrow("direct project mutation");
      await expect(attempt).rejects.toThrow("b.ts");
    });
  });
});

describe("the preview tells the whole truth", () => {
  test("a declared edit is rendered with its diff summary", async () => {
    await withTree(TWO_FILES, async ({ run }) => {
      const { result, output } = await run((ctx) => {
        ctx.plan(handPlan({ description: "declared plan", declares: ["a.ts", "b.ts"], edits: ["a.ts", "b.ts"] }));
      });
      expect(result.filesChanged).toBe(2);
      expect(output).toContain(`~ a.ts    ${ONE_LINE_ADDED}`);
      expect(output).toContain(`~ b.ts    ${ONE_LINE_ADDED}`);
    });
  });

  test("ctx.snapshot() AFTER the mutation still previews the TRUE original — not the edited text", async () => {
    // The declaration seam is legal at any point in the transform, but the diff must not be computed
    // against a post-mutation "original" (that renders a changed file as unchanged, which is the
    // silent-invisibility class one layer down).
    await withTree(TWO_FILES, async ({ run }) => {
      const { result, output } = await run((ctx) => {
        ctx.plan({
          description: "late declaration",
          touchedFiles: ["a.ts"],
          transform(inner): void {
            const b = inner.project.getSourceFileOrThrow(join(inner.repoRoot, "b.ts"));
            b.insertText(0, "// late\n");
            inner.snapshot(b);
          },
        });
      });
      expect(result.filesChanged).toBe(1);
      expect(output).toContain(`~ b.ts    ${ONE_LINE_ADDED}`);
    });
  });

  test("a plan may declare its blast radius mid-transform (ctx.snapshot before the edit)", async () => {
    await withTree(TWO_FILES, async ({ run }) => {
      const { result, output } = await run((ctx) => {
        ctx.plan({
          description: "discovers its radius at transform time",
          touchedFiles: [],
          transform(inner): void {
            for (const sf of inner.project.getSourceFiles()) {
              inner.snapshot(sf);
              sf.insertText(0, "// swept\n");
            }
          },
        });
      });
      expect(result.filesChanged).toBe(2);
      expect(output).toContain("~ a.ts");
      expect(output).toContain("~ b.ts");
    });
  });
});

describe("the kit's own helpers declare their real blast radius", () => {
  test("moveFiles: the importer rewrites move() performs are previewed, not silently applied", async () => {
    await withTree(
      {
        "a.ts": "export const a = 1;\n",
        "b.ts": 'import { a } from "./a";\nexport const b = a + 1;\n',
      },
      async ({ run }) => {
        const { result, output } = await run((ctx) => {
          ctx.plan(moveFiles(ctx, [["a.ts", "sub/a.ts"]]));
        });
        // b.ts's specifier becomes "./sub/a" — the edit the old harness never showed.
        expect(output).toContain("~ b.ts");
        expect(result).toMatchObject({ filesChanged: 1, filesCreated: 1, filesDeleted: 1 });
      },
    );
  });

  test("moveFiles: the vacated path is previewed as deleted (a same-directory rename)", async () => {
    // The vacated path must show up as a deletion. On the REAL project this is where the preview's
    // per-file lookup lied: `project.getSourceFile(oldPath)` kept answering with a live file after
    // `move()`, which compared equal to its own baseline and dropped the line (the renderer now uses
    // an exact path→file map built from `getSourceFiles()`). This fixture pins the rendered contract;
    // the cache condition itself only reproduces at real-project scale.
    await withTree(
      {
        "a.ts": "export const a = 1;\n",
        "b.ts": 'import { a } from "./a";\nexport const b = a + 1;\n',
      },
      async ({ run }) => {
        const { result, output } = await run((ctx) => {
          ctx.plan(moveFiles(ctx, [["a.ts", "a-renamed.ts"]]));
        });
        expect(output).toContain("− a.ts    (deleted)");
        expect(result).toMatchObject({ filesCreated: 1, filesDeleted: 1 });
      },
    );
  });

  test("renameExportedSymbol: every reference site the language service rewrites is previewed", async () => {
    await withTree(
      {
        "api.ts": "export function oldFoo(): number {\n  return 1;\n}\n",
        "barrel.ts": 'export { oldFoo } from "./api";\n',
        "consumer.ts": 'import { oldFoo } from "./barrel";\nexport const used = oldFoo();\n',
      },
      async ({ run }) => {
        const { output } = await run((ctx) => {
          ctx.plan(renameExportedSymbol(ctx, "api.ts", { oldName: "oldFoo", newName: "newFoo" }));
        });
        expect(output).toContain("~ api.ts");
        expect(output).toContain("~ barrel.ts");
        expect(output).toContain("~ consumer.ts");
      },
    );
  });

  test("the standard helper mix (text replacements + delete) applies cleanly under the guard", async () => {
    await withTree(
      {
        "a.ts": "export const a = 1;\n",
        "dead.ts": "export const dead = 0;\n",
      },
      async ({ run, read }) => {
        const { result } = await run(
          (ctx) => {
            const sf = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "a.ts"));
            ctx.plan(applyTextReplacements(ctx, [{ filePath: sf.getFilePath(), start: 0, end: 0, text: "// header\n", label: "add a header" }]));
            ctx.plan(deleteFiles(ctx, ["dead.ts"], { confirm: true }));
          },
          { apply: true },
        );
        expect(result.applied).toBe(true);
        expect(read("a.ts")).toBe("// header\nexport const a = 1;\n");
        expect(() => read("dead.ts")).toThrow();
      },
    );
  });
});
