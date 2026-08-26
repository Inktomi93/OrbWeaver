import process from "node:process";
import { parseRecordArgs } from "@orb/tooling/screen-record";
import { recordVideo } from "../../../../tooling/src/screen-record/ops/record.ts";
import { livingChromiumIdentities, watchChromiumDescendants } from "../../../support/chromium-processes.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a navigation failure closes screen-record's real Chromium process", async ({ scratch }) => {
  const witness = watchChromiumDescendants(process.pid);
  const opts = parseRecordArgs(["/", "--base", "http://127.0.0.1:1", "--settle", "1"]);
  expect(opts.errors).toEqual([]);
  await expect(recordVideo(opts, scratch)).rejects.toThrow();
  const observed = witness.stop();
  expect(observed.length).toBeGreaterThan(0);
  const survivors = livingChromiumIdentities(observed);
  expect(survivors).toEqual([]);
});
