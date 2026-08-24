// near-cap.ts (#644) — the near-cap ADVISORY scan `pnpm check:show` prints, planted against a real temp
// tree (fsBacked: fs.readdir + line counts). Never a gate: no mustFlag/mustPass, no RED arm — the
// component-size / component-size-ui / tooling-size gates keep owning that. This is the ONE test that
// proves the band math (15 lines / 3% of cap, whichever is wider) and the three caps agree with the
// gates they mirror.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nearCapAdvisories } from "../../../../tooling/src/verify/lib/near-cap.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function linesOf(n: number): string {
  return "export const x = 1;\n".repeat(n);
}

async function plantClientFile(scratch: string, rel: string, lines: number): Promise<void> {
  const abs = join(scratch, "packages", "client", "src", rel);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, linesOf(lines));
}

test("a client file exactly ON the cap-15 boundary is reported, with its headroom", async ({ scratch }) => {
  // cap 450, band 15 → headroom 15 is the outer edge (450 - 15 = 435 lines) — the boundary must be INSIDE.
  await plantClientFile(scratch, "lib/at-edge.ts", 435);
  const rows = nearCapAdvisories(scratch);
  expect(rows).toEqual([{ gate: "component-size", file: "packages/client/src/lib/at-edge.ts", lines: 435, cap: 450, headroom: 15 }]);
});

test("one line OUTSIDE the band (16 short of the cap) stays silent", async ({ scratch }) => {
  await plantClientFile(scratch, "lib/comfortable.ts", 434);
  expect(nearCapAdvisories(scratch)).toEqual([]);
});

test("a file already OVER its cap is not re-reported here — that is component-size's RED, not this advisory's job", async ({ scratch }) => {
  await plantClientFile(scratch, "lib/over.ts", 451);
  expect(nearCapAdvisories(scratch)).toEqual([]);
});

test("a routes/ file gets the WIDER 500 cap, so the same line count that would be near-cap for a plain file stays silent there", async ({ scratch }) => {
  await plantClientFile(scratch, "lib/near-450.ts", 440); // headroom 10 vs the 450 cap — reported
  const abs = join(scratch, "packages", "client", "src", "routes", "near-450.tsx");
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, linesOf(440)); // headroom 60 vs the 500 route cap — NOT reported
  const rows = nearCapAdvisories(scratch);
  expect(rows.map((r) => r.file)).toEqual(["packages/client/src/lib/near-450.ts"]);
});

test("sorted by headroom ascending — the file closest to crossing leads", async ({ scratch }) => {
  await plantClientFile(scratch, "lib/further.ts", 437); // headroom 13
  await plantClientFile(scratch, "lib/closer.ts", 449); // headroom 1
  const rows = nearCapAdvisories(scratch);
  expect(rows.map((r) => r.file)).toEqual(["packages/client/src/lib/closer.ts", "packages/client/src/lib/further.ts"]);
});

test("a .test.ts / .d.ts file is exempt — not hand-authored, mirrors component-size's own exemption", async ({ scratch }) => {
  await plantClientFile(scratch, "lib/x.test.ts", 440);
  await plantClientFile(scratch, "lib/x.d.ts", 440);
  expect(nearCapAdvisories(scratch)).toEqual([]);
});

test("packages/ui/src and tooling/src are scanned too, each under their own gate label", async ({ scratch }) => {
  const uiFile = join(scratch, "packages", "ui", "src", "primitives", "x", "x.tsx");
  await mkdir(join(uiFile, ".."), { recursive: true });
  await writeFile(uiFile, linesOf(440));
  const toolingFile = join(scratch, "tooling", "src", "snap", "ops", "y.ts");
  await mkdir(join(toolingFile, ".."), { recursive: true });
  await writeFile(toolingFile, linesOf(440));
  const rows = nearCapAdvisories(scratch);
  expect(rows.map((r) => r.gate).sort()).toEqual(["component-size-ui", "tooling-size"]);
});

test("tooling/src/verify/gates/** is the declared tooling-size carve — a long gate file stays silent here too", async ({ scratch }) => {
  const gateFile = join(scratch, "tooling", "src", "verify", "gates", "long.ts");
  await mkdir(join(gateFile, ".."), { recursive: true });
  await writeFile(gateFile, linesOf(440));
  expect(nearCapAdvisories(scratch)).toEqual([]);
});

test("a missing base dir (no packages/ui in this scratch tree) is a silent skip, not a throw", async ({ scratch }) => {
  await plantClientFile(scratch, "lib/only.ts", 440);
  expect(() => nearCapAdvisories(scratch)).not.toThrow();
});
