// The argv contract of `pnpm record` (tooling/src/screen-record) — the promotion condition of the
// record.ts move (#393 P3: "promoted ONLY if it gains a test at its move"). Pins the step-tape parse
// idioms AND the strict-CLI misuse scan the promotion added (record was the fleet's last lenient
// parser — an unknown flag used to be silently skipped, so a typo'd step recorded the wrong tape).
import { parseRecordArgs } from "../../../tooling/src/screen-record/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

test("the step tape parses in argv order with the LAST-eq fill split (selectors may carry `=`; values may not — the documented trade)", () => {
  const args = parseRecordArgs(["/chats", "--click", "[data-x=1]", "--fill", "[data-name=title]=Hello", "--wheel", "[data-list]=250", "--pause", "900"]);
  expect(args.route).toBe("/chats");
  expect(args.errors).toEqual([]);
  expect(args.steps).toEqual([
    { kind: "click", selector: "[data-x=1]" },
    { kind: "fill", selector: "[data-name=title]", value: "Hello" },
    { kind: "wheel", selector: "[data-list]", dy: 250 },
    { kind: "pause", ms: 900 },
  ]);
});

test("--wheel without =dy takes the default; --frames takes an optional numeric offset", () => {
  const bare = parseRecordArgs(["--wheel", "[data-list]", "--frames"]);
  expect(bare.errors).toEqual([]);
  expect(bare.steps).toEqual([{ kind: "wheel", selector: "[data-list]", dy: 600 }]);
  expect(bare.framesOffsetMs).toBe(450);
  const offset = parseRecordArgs(["--frames", "700"]);
  expect(offset.framesOffsetMs).toBe(700);
});

test("an unknown or value-less flag is CLI misuse (EXIT.misuse), never a silently skipped step", () => {
  expect(parseRecordArgs(["--clikc", "[x]"]).errors).toEqual(["unknown flag --clikc"]);
  expect(parseRecordArgs(["--click", "--pause", "700"]).errors).toEqual(["--click requires a value"]);
  expect(parseRecordArgs(["/a", "/b"]).errors).toEqual(["expected at most one route, got 2"]);
});

test("viewport accepts exact ASCII decimal dimensions only", () => {
  expect(parseRecordArgs(["--viewport", "1024x768"]).errors).toEqual([]);
  for (const raw of ["1e3x768", "+1024x768", " 1024x768", "1024x768 ", "1024.0x768", "1024x768x2"]) {
    expect(parseRecordArgs(["--viewport", raw]).errors).toContain("--viewport requires WIDTHxHEIGHT positive integers");
  }
});
