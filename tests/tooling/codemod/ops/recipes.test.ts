// The kit's RECIPES are copy-paste source: whatever spelling they print is the spelling the next
// codemod author runs. #1775 — `preview-first` printed `node scripts/codemods/<name>.ts`, a bare
// `node` that carries no heap floor (`pnpm-workspace.yaml` `nodeOptions` reaches `pnpm run`/`pnpm exec`
// children only), and a whole-project ts-morph pass OOMs under it at node's ~4GB self-cap.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe } from "vitest";
import { RECIPES } from "../../../../tooling/src/codemod/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Any run line invoking a codemod SCRIPT — the family whose spelling decides the heap floor. */
const CODEMOD_SCRIPT_INVOCATION = /^\s*(?:\/\/\s*)?(?<prefix>\S.*?)\s*scripts\/codemods\/\S+\.ts/gmu;

describe("the recipes print a heap-floored run spelling (#1775)", () => {
  test("every `scripts/codemods/…` invocation in a recipe goes through pnpm", () => {
    const invocations = RECIPES.flatMap((recipe) =>
      [...recipe.code.matchAll(CODEMOD_SCRIPT_INVOCATION)].map((m) => ({ recipe: recipe.name, prefix: m.groups?.["prefix"] ?? "" })),
    );
    // POSITIVE CONTROL: a zero here would pass this test while proving nothing — the regex must be
    // finding the lines it is judging.
    expect(invocations.length).toBeGreaterThan(0);
    for (const { recipe, prefix } of invocations) {
      expect(`${recipe}: ${prefix}`).toContain("pnpm codemod:run");
    }
  });

  test("`codemod:run` exists in package.json and is a bare node (so the script path is its argument)", () => {
    // The pnpm script IS the floor: pnpm exports `nodeOptions` into every `pnpm run` child, and the
    // trailing operands land on `node`. A renamed or rewritten row silently un-floors every recipe.
    const pkg: unknown = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    const scripts = (pkg as { readonly scripts?: Record<string, string> }).scripts ?? {};
    expect(scripts["codemod:run"]).toBe("node");
  });
});
