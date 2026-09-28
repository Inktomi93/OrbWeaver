// The tooling composed test's own proof (docs/law/Core-Tooling-Law.md §5): each serializer rule + a
// planted NEGATIVE (a deterministic string must pass through byte-identical), the toExitWith contract
// diff, runCli's fail-loud unknown-tool refusal, and the scratch/plantedTree/fakeBin seams.
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, fixturePath, test } from "./tool-fixtures.ts";

// The mismatch-diff contract: both codes by NAME + the stdout tail.
const MISMATCH_RE = /0 \(clean\).*1 \(violations\)[\s\S]*stdout: 12 findings/u;

test("scratch is a real dir and plantedTree materializes a violation tree inside it", async ({ scratch, plantedTree }) => {
  expect(existsSync(scratch)).toBe(true);
  const root = await plantedTree({ "tooling/src/badtool/stray.ts": "export const x = 1;\n" });
  expect(root.startsWith(scratch)).toBe(true);
  expect(readFileSync(join(root, "tooling/src/badtool/stray.ts"), "utf8")).toBe("export const x = 1;\n");
});

// #2332: the RUNTIME half of fixture isolation. `policy-fixture-substrate` proves an AUTHORED root
// statically; a dynamic key has none, so the composition door is what bounds it. Both directions:
// the sanctioned compose SUCCEEDS, and each escape shape throws WITHOUT touching the checkout.
test("fixturePath proves the actual target stays in its owned root", ({ repoRoot, scratch }) => {
  const safe = fixturePath(scratch, "written.txt");
  writeFileSync(safe, "owned");
  expect(readFileSync(safe, "utf8")).toBe("owned");

  expect(() => fixturePath(scratch, "..", "escaped.txt")).toThrow("escapes the owned root");
  expect(() => fixturePath(scratch, repoRoot, "escaped.txt")).toThrow("contains an absolute path");
  expect(() => fixturePath(scratch, String.raw`C:\checkout\escaped.txt`)).toThrow("contains an absolute path");

  // The lexical check alone would pass this one: every segment is relative and descends.
  symlinkSync(repoRoot, fixturePath(scratch, "outside-link"));
  expect(() => fixturePath(scratch, "outside-link", "would-write.txt")).toThrow("resolves outside the owned root");
  expect(existsSync(join(repoRoot, "would-write.txt"))).toBe(false);
});

test("plantedTree refuses traversal and absolute keys without writing outside its owned root", async ({ scratch, plantedTree }) => {
  const traversalLeak = join(scratch, "traversal-leak.ts");
  const absoluteLeak = join(scratch, "absolute-leak.ts");

  await expect(plantedTree({ "../../traversal-leak.ts": "leak\n" })).rejects.toThrow("escapes the owned root");
  await expect(plantedTree({ [absoluteLeak]: "leak\n" })).rejects.toThrow("contains an absolute path");

  expect(existsSync(traversalLeak)).toBe(false);
  expect(existsSync(absoluteLeak)).toBe(false);
});

test("repoRoot resolves the actual repo (workspace-safe, not cwd-derived)", ({ repoRoot }) => {
  expect(existsSync(join(repoRoot, "pnpm-workspace.yaml"))).toBe(true);
  expect(existsSync(join(repoRoot, "tooling", "src", "_shared", "exit-contract.ts"))).toBe(true);
});

test("runCli refuses an unknown tool loudly instead of a spawn ENOENT", async ({ runCli }) => {
  await expect(runCli("no-such-tool", [])).rejects.toThrow('no such tool "no-such-tool"');
});

test("fakeBin writes both native launchers and preserves argv through the production process door", async ({ fakeBin, scratch }) => {
  const name = "orb-fake-probe-bin";
  const observed = join(scratch, "fake-bin-argv.json");
  await fakeBin(name, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(observed)}, JSON.stringify(process.argv.slice(2)));\n`);

  const binDir = join(scratch, "fake-bin");
  const moduleName = `${name}.mjs`;
  expect(readFileSync(join(binDir, name), "utf8")).toBe(`#!/usr/bin/env node\nimport "./${moduleName}";\n`);
  expect(readFileSync(join(binDir, `${name}.cmd`), "utf8")).toBe(`@echo off\r\n"${process.execPath.replaceAll("%", "%%")}" "%~dp0${moduleName}" %*\r\n`);
  expect(readFileSync(join(binDir, moduleName), "utf8")).toContain("process.argv.slice(2)");

  const result = await spawnNiced(name, ["argument with a space", "tail"], { cwd: scratch });
  expect(result).toMatchObject({ code: 0, stderr: "", timedOut: false });
  expect(JSON.parse(readFileSync(observed, "utf8"))).toEqual(["argument with a space", "tail"]);
});

test("fakeBin refuses a path instead of composing outside its owned bin directory", async ({ fakeBin, scratch }) => {
  await expect(fakeBin("../escape", "process.exitCode = 0;\n")).rejects.toThrow("must be one command basename");
  await expect(fakeBin("con", "process.exitCode = 0;\n")).rejects.toThrow("must be one command basename");
  await expect(fakeBin("probe.", "process.exitCode = 0;\n")).rejects.toThrow("must be one command basename");
  expect(existsSync(join(scratch, "escape"))).toBe(false);
});

test("toExitWith names both codes by contract and carries output tails on mismatch", async () => {
  const result = { code: 1, stdout: "12 findings", stderr: "", timedOut: false };
  await expect(result).toExitWith(1);
  await expect(expect(result).toExitWith(0)).rejects.toThrow(MISMATCH_RE);
});

// ── the RESULT serializer: each rule + the planted negative ──────────────────────────────────────────
test("the serializer normalizes ONLY the non-deterministic atoms", ({ repoRoot }) => {
  expect(`${repoRoot}/reports/snaps/x.png`).toMatchInlineSnapshot(`"<root>/reports/snaps/x.png"`);
  expect(`${join(tmpdir(), "orb-tool-abc123")}/tree-1`).toMatchInlineSnapshot(`"<scratch>/tree-1"`);
  expect("captured 2026-08-21T17:04:05.123Z").toMatchInlineSnapshot(`"captured <ts>"`);
  expect("stage pid=48213 up").toMatchInlineSnapshot(`"stage pid=<pid> up"`);
  expect("RESULT snap routes=3 elapsed=841ms").toMatchInlineSnapshot(`"RESULT snap routes=3 elapsed=<ms>ms"`);
});

test("PLANTED NEGATIVE: a deterministic string passes through the default serializer untouched", () => {
  // 90ms outside a RESULT line + a plain path: neither atom class — the serializer's test() must decline,
  // or every ordinary snapshot in the tooling tier silently rewrites.
  expect("a plain deterministic string, 90ms of animation, docs/design/x.md").toMatchInlineSnapshot(
    `"a plain deterministic string, 90ms of animation, docs/design/x.md"`,
  );
});
