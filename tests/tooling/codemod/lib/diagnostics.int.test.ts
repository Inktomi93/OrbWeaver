import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { vi } from "vitest";
import { flushBuffer } from "../../../../tooling/src/codemod/lib/diagnostics.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TAG = "planted";
const FIXED_NOW = 1_700_000_000_000;
const VICTIM_BYTES = "victim bytes\n";
const OVERFLOWING = Array.from({ length: 10 }, (_, i) => `line ${i}`);
const LIMIT = 3;

test("the overflow file never writes through a path planted at its predictable name, and still spills when the name is free", ({ scratch }) => {
  vi.stubEnv("TMPDIR", scratch);
  const now = vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const victim = join(scratch, "victim.txt");
    writeFileSync(victim, VICTIM_BYTES);
    symlinkSync(victim, join(scratch, `codemod-${TAG}-${FIXED_NOW}.txt`));

    expect(flushBuffer(OVERFLOWING, TAG, LIMIT)).toBeUndefined();
    expect(readFileSync(victim, "utf8")).toBe(VICTIM_BYTES);
    const printed = stdout.mock.calls.map(([chunk]) => String(chunk));
    for (const line of OVERFLOWING) {
      expect(printed).toContain(`${line}\n`);
    }

    now.mockReturnValue(FIXED_NOW + 1);
    const spilled = flushBuffer(OVERFLOWING, TAG, LIMIT);
    expect(spilled).toBe(join(scratch, `codemod-${TAG}-${FIXED_NOW + 1}.txt`));
    expect(readFileSync(spilled ?? "", "utf8")).toBe(OVERFLOWING.join("\n"));
  } finally {
    stdout.mockRestore();
    now.mockRestore();
    vi.unstubAllEnvs();
  }
});
