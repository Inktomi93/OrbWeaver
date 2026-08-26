import process from "node:process";
import { parseRecordArgs } from "@orb/tooling/screen-record";
import { recordVideo } from "../../../../tooling/src/screen-record/ops/record.ts";
import { chromiumPidsOwnedBy } from "../../../support/chromium-processes.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a navigation failure closes screen-record's real Chromium process", async ({ scratch }) => {
  const before = chromiumPidsOwnedBy(process.cwd());
  const opts = parseRecordArgs(["/", "--base", "http://127.0.0.1:1", "--settle", "1"]);
  expect(opts.errors).toEqual([]);
  await expect(recordVideo(opts, scratch)).rejects.toThrow();
  const survivors = [...chromiumPidsOwnedBy(process.cwd())].filter((pid) => !before.has(pid));
  expect(survivors).toEqual([]);
});
