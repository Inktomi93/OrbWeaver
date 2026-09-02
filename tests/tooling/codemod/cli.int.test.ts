// The codemod CLI's argv contract (#971), driven through the REAL front door. Its old parse dropped every
// `--token` from the positional list before dispatching, so an unknown or typo'd flag was answered with a
// confident wrong result and exit 0 — the silent-accept class. These are DISPATCH tests, not unit tests:
// the grammar only exists at the process boundary, so a spawned cli is the only thing that can prove it.
import { expect, test } from "../../support/tool-fixtures.ts";

test("the bare invocation and both --help spellings are the usage door, exit 0", async ({ runCli }) => {
  for (const args of [[], ["--help"], ["-h"]]) {
    const res = await runCli("codemod", args);
    expect(res.stdout).toContain("codemod");
    await expect(res).toExitWith(0);
  }
});

test("a typo'd flag on a known verb is MISUSE, never the full listing with a clean exit", async ({ runCli }) => {
  // The founding shape: `pnpm codemod list --recipies` printed every helper category and exited 0.
  const res = await runCli("codemod", ["list", "--recipies"]);
  expect(res.stderr).toContain("--recipies");
  await expect(res).toExitWith(3);
});

test("a malformed --max-output-lines value is MISUSE, never a silent fall-back to the default", async ({ runCli }) => {
  const res = await runCli("codemod", ["list", "--max-output-lines=abc"]);
  expect(res.stderr).toContain("--max-output-lines");
  await expect(res).toExitWith(3);
});

test("a well-formed --max-output-lines is accepted and does not become a subcommand", async ({ runCli }) => {
  const res = await runCli("codemod", ["--max-output-lines=5000", "recipes"]);
  await expect(res).toExitWith(0);
});

test("an unknown subcommand is MISUSE", async ({ runCli }) => {
  const res = await runCli("codemod", ["rewrite-everything"]);
  expect(res.stderr).toContain("unknown subcommand");
  await expect(res).toExitWith(3);
});

test("migrate-macro-blocks refuses an unrecognised flag as misuse, not as a missing file", async ({ runCli }) => {
  // It used to land in the FILE list and die inside readFileSync — exit 2, "the tool broke", for what is
  // plainly a bad invocation.
  const res = await runCli("codemod", ["migrate-macro-blocks", "--dry-runn", "some-file.txt"]);
  expect(res.stderr).toContain("--dry-runn");
  await expect(res).toExitWith(3);
});

test("migrate-macro-blocks with no file is misuse", async ({ runCli }) => {
  const res = await runCli("codemod", ["migrate-macro-blocks", "--dry-run"]);
  await expect(res).toExitWith(3);
});
