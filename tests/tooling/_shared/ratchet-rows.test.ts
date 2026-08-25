import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { citeResolves } from "../../../tooling/src/_shared/ratchet-rows.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

test("ratchet cites stay within the repository after normalization and symlink resolution", async ({ scratch }) => {
  const root = join(scratch, "repo");
  const outside = join(scratch, "outside.md");
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "ruling.md"), "ruling\n");
  await writeFile(outside, "outside\n");
  await symlink(outside, join(root, "docs", "escape.md"));
  await symlink(join(root, "docs", "ruling.md"), join(root, "docs", "inside.md"));

  expect(citeResolves(root, "docs/ruling.md#decision")).toBe(true);
  expect(citeResolves(root, "docs/../docs/ruling.md§2")).toBe(true);
  expect(citeResolves(root, "../outside.md")).toBe(false);
  expect(citeResolves(root, "docs/escape.md")).toBe(false);
  expect(citeResolves(root, "docs/inside.md")).toBe(true);
});
