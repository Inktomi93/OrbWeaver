// A kept trace loses the values a run was handed and stays a trace: its lines parse, its keys hold, its pixels pass.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { strToU8, unzipSync, zipSync } from "fflate";
import type { Args } from "../../../../tooling/src/snap/contract/types.ts";
import { notePrivateValues, stopTraceToFile } from "../../../../tooling/src/snap/lib/private-values.ts";

const LONG = "a-long-private-value";
const SHORT = "ab";
const KEYWORD = "true";
const PIXELS = Uint8Array.from([0xff, 0xd8, ...strToU8(LONG), 0xd9]);

function fillOf(value: string): Args["actions"][number] {
  return { type: "step", action: { kind: "fill", selector: "input", value, page: 0 } };
}

async function scrubbed(scratch: string, entries: Readonly<Record<string, Uint8Array>>): Promise<Record<string, Uint8Array>> {
  notePrivateValues({ debugToken: "", localStorage: [], actions: [LONG, SHORT, KEYWORD].map(fillOf) });
  const path = join(scratch, "trace.zip");
  await stopTraceToFile({ stop: ({ path: target }) => writeFile(target, zipSync({ ...entries })) }, path);
  return unzipSync(await readFile(path));
}

test("a JSON line loses a value inside a string and keeps its keys and literals", async ({ scratch }) => {
  const line = { true: true, ab: 1, value: `before ${LONG} after`, exact: SHORT, keyword: KEYWORD, url: "https://ab.example/cab" };
  const entries = await scrubbed(scratch, { "trace.trace": strToU8(`${JSON.stringify(line)}\n`) });
  const entry = entries["trace.trace"];
  if (entry === undefined) {
    throw new Error("the action log did not survive the rewrite");
  }
  expect(JSON.parse(Buffer.from(entry).toString("utf8"))).toEqual({
    true: true,
    ab: 1,
    value: "before <private> after",
    exact: "<private>",
    keyword: "<private>",
    url: "https://ab.example/cab",
  });
});

test("a resource loses a value by its bytes, and the bytes around it survive", async ({ scratch }) => {
  const around = Uint8Array.from([0x00, 0xff, ...strToU8(LONG), 0xfe]);
  const entries = await scrubbed(scratch, { "resources/body.bin": around });
  expect(Array.from(entries["resources/body.bin"] ?? [])).toEqual([0x00, 0xff, ...strToU8("<private>"), 0xfe]);
});

test("a screenshot is never rewritten, because a replacement would corrupt the image", async ({ scratch }) => {
  const entries = await scrubbed(scratch, { "resources/shot.jpeg": PIXELS });
  expect(entries["resources/shot.jpeg"]).toEqual(PIXELS);
});

test("a run with nothing private keeps the trace Playwright wrote", async ({ scratch }) => {
  const written = zipSync({ "trace.trace": strToU8("{}\n") });
  const path = join(scratch, "untouched.zip");
  await stopTraceToFile({ stop: ({ path: target }) => writeFile(target, written) }, path);
  expect(unzipSync(await readFile(path))["trace.trace"]).toEqual(strToU8("{}\n"));
});
