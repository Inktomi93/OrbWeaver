import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ownedTempDir } from "./temp-dir.ts";

async function failingBody(report: { directory: string }): Promise<void> {
  await using owner = new AsyncDisposableStack();
  report.directory = await ownedTempDir(owner, "orb-temp-dir-case-");
  writeFileSync(join(report.directory, "left-behind"), "x");
  throw new Error("the test body failed");
}

test("a failing body still removes the folder it made", async () => {
  const report = { directory: "" };

  await expect(failingBody(report)).rejects.toThrow("the test body failed");

  expect(report.directory).toContain("orb-temp-dir-case-");
  expect(existsSync(report.directory)).toBe(false);
});

test("the folder lives for the whole body and goes at disposal", async () => {
  const owner = new AsyncDisposableStack();
  const directory = await ownedTempDir(owner, "orb-temp-dir-case-");

  expect(existsSync(directory)).toBe(true);
  await owner.disposeAsync();
  expect(existsSync(directory)).toBe(false);
});
