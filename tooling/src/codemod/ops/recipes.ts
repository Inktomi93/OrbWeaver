// RECIPES + the help printers (`pnpm codemod help|list|recipes|recipe|search`).

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { flushBuffer } from "../lib/diagnostics.ts";
import { MANIFEST } from "./manifest.ts";

refuseDirectInvocation(import.meta.url, "pnpm codemod <verb>");

interface Recipe {
  readonly name: string;
  readonly description: string;
  readonly code: string;
}

export const RECIPES: readonly Recipe[] = [
  {
    name: "preview-first",
    description: "Run any codemod safely. Default is dry-run; --apply commits.",
    code: `// In your codemod file:
import { runCodemod } from "@orb/tooling/codemod";

await runCodemod("my-codemod", (ctx) => {
  // ... ctx.plan(...) calls
});

// Run from the repo root. \`codemod:run\` is \`node\` UNDER the workspace heap floor
// (pnpm-workspace.yaml \`nodeOptions\`); a bare \`node\`/\`npx\` carries no floor and a
// whole-project ts-morph pass OOMs at node's ~4GB self-cap, so runCodemod refuses to start:
//   pnpm codemod:run scripts/codemods/my-codemod.ts            # preview only
//   pnpm codemod:run scripts/codemods/my-codemod.ts --apply    # write changes`,
  },
  {
    name: "move-files",
    description: "Move files and fix every import that referenced them.",
    code: `import { moveFiles, repointAliasPaths, runCodemod } from "@orb/tooling/codemod";

await runCodemod("move-foo", (ctx) => {
  // 1. Move files. Relative imports auto-rewrite.
  ctx.plan(moveFiles(ctx, [
    ["src/foo.ts", "src/feature/foo.ts"],
    ["src/foo.test.ts", "src/feature/foo.test.ts"],
  ]));
  // 2. Sweep #alias paths ts-morph's move() doesn't follow.
  ctx.plan(repointAliasPaths(ctx, [
    [/#server\\/foo/g, "#server/feature/foo"],
  ]));
});`,
  },
  {
    name: "split-types-file",
    description: "Split one types.ts into many contract/*.ts files (symbol routing).",
    code: `import { routeSymbolsByMap, deleteFiles, runCodemod } from "@orb/tooling/codemod";

await runCodemod("split-types", (ctx) => {
  ctx.plan(routeSymbolsByMap(ctx, "#server/feature/types", {
    FooDetail: "#server/feature/contract/views",
    FooParams: "#server/feature/contract/params",
    FooError:  "#server/feature/contract/errors",
  }));
  // After every importer is repointed, drop the old types.ts.
  ctx.plan(deleteFiles(ctx, ["src/server/feature/types.ts"], { confirm: true }));
});`,
  },
  {
    name: "rename-symbol",
    description: "Rename an exported symbol everywhere (language-service-aware).",
    code: `import { renameExportedSymbol, runCodemod } from "@orb/tooling/codemod";

await runCodemod("rename-foo", (ctx) => {
  ctx.plan(
    renameExportedSymbol(ctx, "src/feature/api.ts", { oldName: "oldFoo", newName: "newFoo" }),
  );
});`,
  },
  {
    name: "rewrite-callsites",
    description: "Rewrite N matching expressions in one file without the stale-node footgun.",
    code: `import {
  applyTextReplacements, replacementsForNodes, runCodemod, SyntaxKind,
} from "@orb/tooling/codemod";

await runCodemod("flip-foo-call", (ctx) => {
  const sf = ctx.project.getSourceFileOrThrow("src/feature/foo.ts");
  const calls = sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === "oldFoo");
  const plans = replacementsForNodes(calls, (call) => ({
    text: call.getText().replace(/^oldFoo/, "newFoo"),
    label: "oldFoo() → newFoo()",
  }));
  ctx.plan(applyTextReplacements(ctx, plans));
});`,
  },
  {
    name: "rename-jsx-component",
    description: "Rename a JSX component everywhere it's used + fix the import.",
    code: `import {
  renameJsxTag, renameNamedImport, runCodemod,
} from "@orb/tooling/codemod";

await runCodemod("rename-button", (ctx) => {
  ctx.plan(renameJsxTag(ctx, "OldButton", "NewButton"));
  ctx.plan(
    renameNamedImport(ctx, "@/components/ui/button", { oldName: "OldButton", newName: "NewButton" }),
  );
});`,
  },
  {
    name: "add-export-to-barrel",
    description: "Lift an internal symbol to a feature's front door (index.ts).",
    code: `import { addReExport, runCodemod } from "@orb/tooling/codemod";

await runCodemod("lift-fooDetail", (ctx) => {
  ctx.plan(
    addReExport(ctx, "src/feature/index.ts", {
      moduleSpecifier: "./contract/views",
      name: "FooDetail",
      isTypeOnly: true,
    }),
  );
});`,
  },
];

// ── Help / list / recipe printers ────────────────────────────────────────────
//
// Why on the kit and not in a separate file: the CLI wrapper
// `codemod-help.ts` is two lines; everything load-bearing about the help
// surface (sections, entries, recipes) lives next to the code so a stale
// entry is harder to merge.

const KIT_FILE_RELATIVE = "tooling/src/codemod";
/** Column width for category ids in the `help` overview listing. */
const CATEGORY_ID_COLUMN_WIDTH = 14;
/** Column width for recipe names in the `help` overview listing. */
const RECIPE_NAME_COLUMN_WIDTH = 22;

const OVERVIEW = `
ts-morph codemod toolkit — quick reference

When to reach for this:
  • A code change touches > ~3 files in a mechanical way (rename, restructure,
    swap a barrel). Use a codemod, not a sed loop, not by hand.
  • You want to preview the change before it lands. The harness runs
    DRY-RUN by default; pass --apply to commit.

How to read this help:
  pnpm codemod              # this overview
  pnpm codemod list         # every helper, grouped by category
  pnpm codemod list <id>    # one category (e.g. \`imports\`, \`files\`)
  pnpm codemod search <q>   # grep helpers + recipes by keyword
  pnpm codemod recipes      # common recipes (move, rename, split types.ts, …)
  pnpm codemod recipe <id>  # one recipe with copy-pasteable code

The toolkit lives at ${KIT_FILE_RELATIVE}.
The doc-comment at the top is the authoritative spec; the manifest below is
its categorical index.

Categories:
${MANIFEST.map((c) => `  • ${c.id.padEnd(CATEGORY_ID_COLUMN_WIDTH)} ${c.title}`).join("\n")}

Recipes:
${RECIPES.map((r) => `  • ${r.name.padEnd(RECIPE_NAME_COLUMN_WIDTH)} ${r.description}`).join("\n")}
`;

/** Print the high-level overview. Default `pnpm codemod` output. Short
 *  enough that overflow handling isn't usually needed, but routed through
 *  the buffer for consistency with the other printers. */
export function printHelp(maxOutputLines?: number): void {
  flushBuffer([OVERVIEW], "help", maxOutputLines);
}

/** Print every helper grouped by category. If `categoryId` is given, only
 *  that category. The full list runs ~80 lines for the current MANIFEST;
 *  if the kit grows past the threshold the overflow goes to /tmp. */
export function printList(categoryId?: string, maxOutputLines?: number): void {
  const scoped = categoryId !== undefined && categoryId !== "";
  const targets = scoped ? MANIFEST.filter((c) => c.id === categoryId) : MANIFEST;
  const buf: string[] = [];
  if (targets.length === 0) {
    buf.push(`No category "${categoryId}". Available: ${MANIFEST.map((c) => c.id).join(", ")}`);
    flushBuffer(buf, "list", maxOutputLines);
    return;
  }
  for (const cat of targets) {
    buf.push(`\n── ${cat.title} (${cat.id}) ──`);
    for (const e of cat.entries) {
      buf.push(`\n  ${e.name}`);
      buf.push(`    ${e.summary}`);
      buf.push(`    Use when: ${e.when}`);
    }
  }
  flushBuffer(buf, scoped ? `list-${categoryId}` : "list", maxOutputLines);
}

/** Print every recipe with its description + code block. Almost always
 *  exceeds the threshold — the full output spills to /tmp. */
export function printRecipes(maxOutputLines?: number): void {
  const buf: string[] = [];
  for (const r of RECIPES) {
    buf.push(`\n${r.name} — ${r.description}\n`);
    buf.push(indent(r.code, "    "));
  }
  flushBuffer(buf, "recipes", maxOutputLines);
}

/** Print one recipe by name. Single-recipe view; no overflow expected. */
export function printRecipe(name: string, maxOutputLines?: number): void {
  const buf: string[] = [];
  const r = RECIPES.find((x) => x.name === name);
  if (!r) {
    buf.push(`No recipe "${name}". Available: ${RECIPES.map((x) => x.name).join(", ")}`);
    flushBuffer(buf, "recipe-not-found", maxOutputLines);
    return;
  }
  buf.push(`\n${r.name} — ${r.description}\n`);
  buf.push(r.code);
  buf.push("");
  flushBuffer(buf, `recipe-${name}`, maxOutputLines);
}

/** Search helper names + summaries + recipe names + descriptions for a
 *  keyword. Cheap substring match (case-insensitive). Hits over the
 *  threshold spill to /tmp. */
export function searchHelpers(query: string, maxOutputLines?: number): void {
  const q = query.toLowerCase();
  const buf: string[] = [];
  const hits: string[] = [];
  for (const cat of MANIFEST) {
    for (const e of cat.entries) {
      const hay = `${e.name}\n${e.summary}\n${e.when}`.toLowerCase();
      if (hay.includes(q)) {
        hits.push(`  [${cat.id}] ${e.name}\n    ${e.summary}`);
      }
    }
  }
  for (const r of RECIPES) {
    const hay = `${r.name}\n${r.description}`.toLowerCase();
    if (hay.includes(q)) {
      hits.push(`  [recipe] ${r.name}\n    ${r.description}`);
    }
  }
  if (hits.length === 0) {
    buf.push(`No matches for "${query}".`);
  } else {
    buf.push(`\nMatches for "${query}":\n`);
    for (const h of hits) {
      buf.push(h);
      buf.push("");
    }
  }
  flushBuffer(buf, `search-${query}`, maxOutputLines);
}

function indent(text: string, prefix: string): string {
  return text
    .split(/\r?\n/u)
    .map((l) => prefix + l)
    .join("\n");
}
