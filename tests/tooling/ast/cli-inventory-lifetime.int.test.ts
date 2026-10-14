// @subject tooling/src/ast/cli.ts
// @subject tooling/src/ast/lib/emit.ts
import { cpSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { expect, fixturePath, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  inventoryGenerationPrograms,
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { z } from "zod";

const closeEvent = z.object({ path: z.string().nullable(), open: z.boolean() });

function write(root: string, path: string, text: string): void {
  const absolute = fixturePath(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function fixture(root: string, repoRoot: string, detached: boolean): void {
  write(root, ".gitignore", "node_modules\ntooling/\n.cache/\n");
  write(root, "package.json", JSON.stringify({ type: "module", scripts: {} }));
  write(
    root,
    "tsconfig.json",
    JSON.stringify({
      files: ["packages/kit/src/a.ts", "scripts/tool.ts"],
      compilerOptions: { noLib: true, types: [], target: "ES2022", module: "ESNext", moduleResolution: "Bundler" },
    }),
  );
  write(root, "packages/kit/src/a.ts", "export const value=1; export const unused=2;\n");
  write(
    root,
    "scripts/tool.ts",
    `const witness='value' satisfies keyof typeof import('../packages/kit/src/a'); export const checked=${detached ? "'detached'" : "witness"};\n`,
  );
  // Relocate unchanged CLI bytes so its existing root discovery names this tiny native repository.
  cpSync(join(repoRoot, "tooling/src/ast"), fixturePath(root, "tooling/src/ast"), { recursive: true });
  for (const entry of readdirSync(join(repoRoot, "tooling/src"), { withFileTypes: true })) {
    if (entry.name !== "ast") {
      symlinkSync(join(repoRoot, "tooling/src", entry.name), fixturePath(root, "tooling/src", entry.name));
    }
  }
  symlinkSync(join(repoRoot, "node_modules"), fixturePath(root, "node_modules"));
  execFixtureGit(root, ["init", "-q"]);
}

test("the actual inventory CLI closes its pinned database before process cleanup on success and consumer failure", { tags: ["slow"] }, async ({
  scratch,
  repoRoot,
}) => {
  for (const detached of [false, true]) {
    const root = fixturePath(scratch, detached ? "failure" : "success");
    fixture(root, repoRoot, detached);
    expect(readCompilerPrograms(root).map(({ id, files }) => ({ id, files }))).toEqual([
      { id: "tsconfig.json", files: ["packages/kit/src/a.ts", "scripts/tool.ts"] },
    ]);
    const trace = join(root, ".cache/close.jsonl");
    const preload = join(root, ".cache/observe-close.mjs");
    write(
      root,
      ".cache/observe-close.mjs",
      `import {appendFileSync,writeFileSync} from 'node:fs';
      import {DatabaseSync} from 'node:sqlite';
      const trace=${JSON.stringify(trace)};writeFileSync(trace,'');
      const close=DatabaseSync.prototype.close;
      DatabaseSync.prototype.close=function(){const path=this.location();close.call(this);appendFileSync(trace,JSON.stringify({path,open:this.isOpen})+'\\n');};\n`,
    );
    const result = await spawnNiced(process.execPath, ["--import", preload, join(root, "tooling/src/ast/cli.ts"), "orphans", "packages/kit/src", "--json"], {
      cwd: root,
      timeoutMs: budget(30_000),
    });
    expect(result.code, result.stderr).toBe(detached ? 2 : 0);
    expect(result.stdout.length > 0, result.stderr).toBe(!detached);
    const closed = readFileSync(trace, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => closeEvent.parse(JSON.parse(line)));
    expect(closed.filter((event) => event.path === join(root, ".cache/semantic-inventory.sqlite"))).toEqual([
      { path: join(root, ".cache/semantic-inventory.sqlite"), open: false },
    ]);
    using database = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
    const generation = latestInventoryGeneration(database);
    expect(inventoryGenerationPrograms(database, generation)).toEqual(["tsconfig.json"]);
    expect(readInventoryGeneration(database, generation)[0]?.roots).toHaveLength(2);
  }
});
