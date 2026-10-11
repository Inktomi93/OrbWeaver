// The relocate codemod over a planted git tree: every specifier spelling it owns is re-derived from the
// moved file's identity, and everything it cannot place is reported rather than guessed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { relocatePlanSchema } from "../../../../tooling/src/codemod/contract/relocate.ts";
import { applyRelocation, CodemodError, planRelocation } from "../../../../tooling/src/codemod/index.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TOOL_MANIFEST = JSON.stringify({
  name: "@t/tool",
  exports: { "./*": "./src/*/index.ts", "./old/*": "./src/old/*.ts" },
  imports: { "#*": "./src/*/index.ts" },
});
const ROUTED_PLAN = relocatePlanSchema.parse({
  moves: [{ from: "tool/src/old", to: "tool/src/floor", shortForms: true, route: { net: ["net*.ts"], text: ["text.ts", "data.json"] } }],
  manifests: { "tool/package.json": { exports: { "./*": "./src/*/index.ts", "./floor/*": "./src/floor/*.ts" } } },
  residue: ["/old/"],
});

async function gitTree(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>, files: Readonly<Record<string, string>>): Promise<string> {
  const root = await plantedTree({ "package.json": JSON.stringify({ name: "@t/root" }), "tool/package.json": TOOL_MANIFEST, ...files });
  execFixtureGit(root, ["init", "-q"]);
  return root;
}

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf8");

test("a routed move re-spells relative, package, URL and joined-segment paths from the moved identities", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, {
    "tool/src/old/net.ts": 'import { t } from "./text.ts";\nexport const url = new URL("../../package.json", import.meta.url);\nexport const n = t;\n',
    "tool/src/old/net-extra.ts": 'export const root = join(import.meta.dirname, "..", "..");\n',
    "tool/src/old/text.ts": 'export const data = new URL("./data.json", import.meta.url);\nexport const t = 1;\n',
    "tool/src/old/data.json": "{}\n",
    "tool/src/snap/ops/run.ts": 'import { n } from "../../old/net.ts";\nimport { t } from "@t/tool/old/text";\nexport const r = [n, t];\n',
    "docs/law.md": "See `tool/src/old/net.ts`, `old/net-extra.ts` and `old/text`. The sibling `old/net` is net.ts.\n",
  });
  applyRelocation(root, planRelocation(root, ROUTED_PLAN));

  expect(read(root, "tool/src/floor/net/net.ts")).toBe(
    'import { t } from "../text/text.ts";\nexport const url = new URL("../../../package.json", import.meta.url);\nexport const n = t;\n',
  );
  expect(read(root, "tool/src/floor/net/net-extra.ts")).toBe('export const root = join(import.meta.dirname, "..", "..", "..");\n');
  expect(read(root, "tool/src/floor/text/text.ts")).toContain('new URL("./data.json", import.meta.url)');
  expect(read(root, "tool/src/snap/ops/run.ts")).toBe(
    'import { n } from "../../floor/net/net.ts";\nimport { t } from "@t/tool/floor/text/text";\nexport const r = [n, t];\n',
  );
  expect(read(root, "docs/law.md")).toBe(
    "See `tool/src/floor/net/net.ts`, `floor/net/net-extra.ts` and `floor/text/text`. The sibling `floor/net/net` is net.ts.\n",
  );
  expect(JSON.parse(read(root, "tool/package.json"))).toHaveProperty("exports", { "./*": "./src/*/index.ts", "./floor/*": "./src/floor/*.ts" });
});

test("a whole-directory rename re-spells the importer's # subpath and leaves a same-prefix sibling alone", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, {
    "tool/src/kit/fetch/index.ts": "export const f = 1;\n",
    "tool/src/kitchen/index.ts": "export const k = 1;\n",
    "tool/src/domain/a.ts": 'import { f } from "#kit/fetch";\nimport { k } from "#kitchen";\nexport const a = [f, k];\n',
  });
  applyRelocation(root, planRelocation(root, relocatePlanSchema.parse({ moves: [{ from: "tool/src/kit", to: "tool/src/query" }] })));

  expect(read(root, "tool/src/domain/a.ts")).toBe('import { f } from "#query/fetch";\nimport { k } from "#kitchen";\nexport const a = [f, k];\n');
});

test("a relative literal outside a module position is reported with its new spelling, never rewritten", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, {
    "tool/src/old/net.ts": "export const n = 1;\n",
    "tool/src/old/text.ts": "export const t = 1;\n",
    "tool/src/old/data.json": "{}\n",
    "tool/src/snap/fixture.ts": 'export const spec = "../old/net.ts";\n',
  });
  // Short forms off: an opted-in short citation would re-spell the literal as text, which is the other path.
  const result = planRelocation(root, { ...ROUTED_PLAN, moves: ROUTED_PLAN.moves.map((move) => ({ ...move, shortForms: false })) });

  expect(result.notes).toEqual([
    expect.objectContaining({ file: "tool/src/snap/fixture.ts", text: "../old/net.ts", reason: expect.stringContaining("../floor/net/net.ts") }),
  ]);
  expect(result.writes.has("tool/src/snap/fixture.ts")).toBe(false);
});

test("a routed file that matches no role refuses before anything moves", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, { "tool/src/old/net.ts": "export const n = 1;\n", "tool/src/old/stray.ts": "export const s = 1;\n" });

  expect(() => planRelocation(root, ROUTED_PLAN)).toThrow(CodemodError);
  expect(() => planRelocation(root, ROUTED_PLAN)).toThrow(/stray\.ts matches no role/u);
});
