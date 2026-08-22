// The doc-catalog cli's exit contract through the REAL binary. Both verbs are `pnpm check` stages, so
// their codes are load-bearing: unformatted docs / stale catalog = VIOLATIONS (1), a bad verb = MISUSE
// (3), and neither may read as the other. The formatter arm drives a scratch file so the run asserts the
// tool's judgment without depending on the corpus being clean at that moment.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../support/tool-fixtures.ts";

// A pipe-aligned GFM table — exactly the token waste the formatter exists to strip.
const PADDED = "---\nkind: design\nstatus: active\nupdated: 2026-08-21\n---\n\n# Doc\n\n| key   | value   |\n| ----- | ------- |\n| a     | b       |\n";
const COMPACT = "---\nkind: design\nstatus: active\nupdated: 2026-08-21\n---\n\n# Doc\n\n| key | value |\n| - | - |\n| a | b |\n";

test("format --check reds on a pipe-aligned table and names the file", async ({ runCli, scratch }) => {
  const file = join(scratch, "padded.md");
  await writeFile(file, PADDED);
  const res = await runCli("doc-catalog", ["format", "--check", file]);
  expect(res).toExitWith(1);
  expect(res.stderr).toContain("not formatted");
  expect(res.stderr).toContain(file);
});

test("format --check passes a document already in compact form", async ({ runCli, scratch }) => {
  const file = join(scratch, "compact.md");
  await writeFile(file, COMPACT);
  const res = await runCli("doc-catalog", ["format", "--check", file]);
  expect(res).toExitWith(0);
  expect(res.stdout).toContain("1 file(s) formatted");
});

test("an unknown verb is misuse, not a violation and not a crash", async ({ runCli }) => {
  const res = await runCli("doc-catalog", ["reticulate"]);
  expect(res).toExitWith(3);
  expect(res.stderr).toContain("usage: doc-catalog");
});

test("a valid verb with an unknown mode is misuse", async ({ runCli }) => {
  const res = await runCli("doc-catalog", ["catalog", "--obliterate"]);
  expect(res).toExitWith(3);
  expect(res.stderr).toContain("usage: doc-catalog");
});
