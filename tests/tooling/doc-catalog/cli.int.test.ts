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
  await expect(res).toExitWith(1);
  expect(res.stderr).toContain("not formatted");
  expect(res.stderr).toContain(file);
});

test("format --check passes a document already in compact form", async ({ runCli, scratch }) => {
  const file = join(scratch, "compact.md");
  await writeFile(file, COMPACT);
  const res = await runCli("doc-catalog", ["format", "--check", file]);
  await expect(res).toExitWith(0);
  expect(res.stdout).toContain("1 file(s) formatted");
});

// A cell whose code span is split by bare pipes under a header wide enough to hide the split (#2235):
// the parse loses the span, the serializer escapes the orphaned backticks, and the write cements it.
const CEMENTED =
  "---\nkind: design\nstatus: active\nupdated: 2026-09-12\n---\n\n| # | Flag | Alt | Alt2 | Why |\n| - | - | - | - | - |\n| 1 | the flag `--theme <name | id | none>` splits | probe |\n";

test("a REFUSAL never swallows the not-formatted census, and the two are distinguishable by line", async ({ runCli, scratch }) => {
  // THE REPORTING HALF OF #2235, pinned at the real binary because it is a property of the DOOR. Adding
  // the refusal arm moved `--check` from "0 refused, N dirty" to "2 refused" — the door returned on the
  // first refusal and never printed the dirty list, so a corpus carrying 163 unformatted files would have
  // reported "2 file(s)" and the debt would have read as evaporated. An instrument that UNDERSTATES after
  // a change nobody thinks to re-measure is the exact class this program exists to kill.
  //
  // The second assertion is the machine-readability half: a barrier asking "did it refuse, or is this
  // ordinary dirt?" keys on the `REFUSED ` line prefix, never on the banner prose.
  const refused = join(scratch, "cemented.md");
  const dirty = join(scratch, "padded.md");
  await writeFile(refused, CEMENTED);
  await writeFile(dirty, PADDED);

  const res = await runCli("doc-catalog", ["format", "--check", refused, dirty]);

  // A refusal is a VERDICT about the document, so it is a violation (1) — never a tool error (2), which
  // would claim the other file was never judged.
  await expect(res).toExitWith(1);
  expect(res.stderr).toContain("1 file(s) REFUSED");
  expect(res.stderr).toContain(`REFUSED ${refused}`);
  expect(res.stderr).toContain("1 file(s) not formatted");
  expect(res.stderr).toContain(dirty);
  expect(res.stderr).not.toContain(`REFUSED ${dirty}`);
});

test("an unknown verb is misuse, not a violation and not a crash", async ({ runCli }) => {
  const res = await runCli("doc-catalog", ["reticulate"]);
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("usage: doc-catalog");
});

test("a valid verb with an unknown mode is misuse", async ({ runCli }) => {
  const res = await runCli("doc-catalog", ["catalog", "--obliterate"]);
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("usage: doc-catalog");
});
