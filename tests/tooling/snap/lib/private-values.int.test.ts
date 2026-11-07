// A kept trace loses the values a run revealed and stays a trace: its lines parse, its keys hold, its pixels pass. A trace
// that cannot be scrubbed is not kept at all, and a value is noted only when it is revealed, so parsing stays pure.
import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { strToU8, unzipSync, zipSync } from "fflate";
import { PRIVATE_MASK } from "../../../../tooling/src/snap/contract/disk-safe-argv.ts";
import {
  __resetPrivateValues,
  privateText,
  scrubPrivateFile,
  scrubPrivateJson,
  scrubPrivateText,
  stopTraceToFile,
} from "../../../../tooling/src/snap/lib/private-values.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";

const LONG = "a-long-private-value";
const SHORT = "ab";
const KEYWORD = "true";
const PIXELS = Uint8Array.from([0xff, 0xd8, ...strToU8(LONG), 0xd9]);
/** What a real password looks like: each of these four characters is spelled differently by JSON, a URL and a form. */
const PASSWORD = 'pl"ant& word+9z';
const READ_ONLY = 0o400;

/** Reveal `values` for one case, and forget them at its end: Node suites share one module registry per worker. */
function revealed(...values: readonly string[]): Disposable {
  __resetPrivateValues();
  for (const value of values) {
    privateText(value).reveal();
  }
  return { [Symbol.dispose]: __resetPrivateValues };
}

async function scrubbed(scratch: string, entries: Readonly<Record<string, Uint8Array>>): Promise<Record<string, Uint8Array>> {
  const path = join(scratch, "trace.zip");
  await stopTraceToFile({ stop: ({ path: target }) => writeFile(target, zipSync({ ...entries })) }, path);
  return unzipSync(await readFile(path));
}

test("a JSON line loses a value inside a string and keeps its keys and literals", async ({ scratch }) => {
  using _values = revealed(LONG, SHORT, KEYWORD);
  const line = { true: true, ab: 1, value: `before ${LONG} after`, exact: SHORT, keyword: KEYWORD, url: "https://ab.example/cab" };
  const entries = await scrubbed(scratch, { "trace.trace": strToU8(`${JSON.stringify(line)}\n`) });
  const entry = entries["trace.trace"];
  if (entry === undefined) {
    throw new Error("the action log did not survive the rewrite");
  }
  expect(JSON.parse(Buffer.from(entry).toString("utf8"))).toEqual({
    true: true,
    ab: 1,
    value: `before ${PRIVATE_MASK} after`,
    exact: PRIVATE_MASK,
    keyword: PRIVATE_MASK,
    url: "https://ab.example/cab",
  });
});

test("a resource loses a value by its bytes, and the bytes around it survive", async ({ scratch }) => {
  using _values = revealed(LONG);
  const around = Uint8Array.from([0x00, 0xff, ...strToU8(LONG), 0xfe, ...strToU8(LONG)]);
  const entries = await scrubbed(scratch, { "resources/body.bin": around });
  expect(Array.from(entries["resources/body.bin"] ?? [])).toEqual([0x00, 0xff, ...strToU8(PRIVATE_MASK), 0xfe, ...strToU8(PRIVATE_MASK)]);
});

test("a screenshot is never rewritten, because a replacement would corrupt the image", async ({ scratch }) => {
  using _values = revealed(LONG);
  const entries = await scrubbed(scratch, { "resources/shot.jpeg": PIXELS });
  expect(entries["resources/shot.jpeg"]).toEqual(PIXELS);
});

// Each spelling here is what the named standard library call makes of the password, so a new encoding is one row.
test.for([
  ["as JSON", JSON.stringify({ note: PASSWORD })],
  ["as JSON inside JSON", JSON.stringify({ body: JSON.stringify({ note: PASSWORD }) })],
  ["as a form", new URLSearchParams({ note: PASSWORD }).toString()],
  ["as a query value", `/echo?plain=${encodeURIComponent(PASSWORD)}`],
  ["as an unencoded URL", encodeURI(`/echo?plain=${PASSWORD}`)],
  ["as JSON inside a URL, the shape of a tRPC GET", `/api/trpc/x?input=${encodeURIComponent(JSON.stringify({ q: PASSWORD }))}`],
] as const)("a resource loses a value sent %s", async ([_name, body], { scratch }) => {
  using _values = revealed(PASSWORD);
  const entries = await scrubbed(scratch, { "resources/sent.dat": strToU8(body) });
  const kept = Buffer.from(entries["resources/sent.dat"] ?? []).toString("utf8");
  expect(kept).not.toEqual(body);
  expect(kept).toContain(PRIVATE_MASK);
  expect(kept).not.toContain("word");
});

test.each([
  ["the shorter first", ["hunter2", "hunter2-long-tail"]],
  ["the longer first", ["hunter2-long-tail", "hunter2"]],
])("a value inside a longer one leaves no tail, with %s", (_name, values) => {
  using _values = revealed(...values);
  expect(scrubPrivateText("typed hunter2-long-tail here")).toBe(`typed ${PRIVATE_MASK} here`);
  expect(scrubPrivateText("typed hunter2 here")).toBe(`typed ${PRIVATE_MASK} here`);
});

test("a trace that cannot be scrubbed is not kept, and its failure quotes none of it", async ({ scratch }) => {
  using _values = revealed(LONG);
  const path = join(scratch, "trace.zip");
  let rawPath = "";
  const unreadable = strToU8(`{"ok":true}\n${LONG} is not JSON\n`);
  const stop = async ({ path: target }: { readonly path: string }): Promise<void> => {
    rawPath = target;
    await writeFile(target, zipSync({ "trace.trace": unreadable }));
  };
  const failure = await stopTraceToFile({ stop }, path).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  expect(failure).toMatch(/INSTRUMENT ERROR: a trace line could not be read/u);
  expect(failure).not.toContain(LONG);
  expect(rawPath).not.toBe("");
  expect(existsSync(path)).toBe(false);
  expect(existsSync(rawPath)).toBe(false);
});

test("the raw trace is written outside the run's folder, so a killed process leaves nothing where evidence is read", async ({ scratch }) => {
  using _values = revealed(LONG);
  const path = join(scratch, "slot", "trace.zip");
  const stopped: string[] = [];
  await expect(
    stopTraceToFile(
      {
        stop: ({ path: target }) => {
          stopped.push(target);
          return Promise.reject(new Error("the browser went away"));
        },
      },
      path,
    ),
  ).rejects.toThrow("the browser went away");
  expect(stopped).toHaveLength(1);
  expect(stopped[0]?.startsWith(dirname(path))).toBe(false);
  expect(existsSync(dirname(stopped[0] ?? ""))).toBe(false);
});

test("a run with nothing private keeps the trace Playwright wrote, at the kept path, untouched", async ({ scratch }) => {
  using _values = revealed();
  const written = zipSync({ "trace.trace": strToU8("not even JSON\n") });
  const path = join(scratch, "untouched.zip");
  const stopped: string[] = [];
  await stopTraceToFile(
    {
      stop: async ({ path: target }) => {
        stopped.push(target);
        await writeFile(target, written);
      },
    },
    path,
  );
  expect(stopped).toEqual([path]);
  expect(await readFile(path)).toEqual(Buffer.from(written));
});

test("a private value serializes as the mask, and is noted only when it is revealed", () => {
  using _values = revealed();
  const value = privateText(LONG);
  expect(JSON.stringify({ value })).toBe(`{"value":"${PRIVATE_MASK}"}`);
  // The lint refuses this spelling on a `PrivateText`, so it is widened here to reach the runtime guard behind that rule.
  expect(String(value as unknown)).toBe(PRIVATE_MASK);
  expect(scrubPrivateText(`typed ${LONG}`)).toBe(`typed ${LONG}`);
  expect(value.reveal()).toBe(LONG);
  expect(scrubPrivateText(`typed ${LONG}`)).toBe(`typed ${PRIVATE_MASK}`);
});

// Writers such as the design audit's report dump the tape whole, so a whole parse has to serialize clean.
test("a parsed tape and its seeds serialize with no typed value, and parsing notes nothing", () => {
  using _values = revealed();
  const parsed = parseSnapArgs(["/", "--fill", `input=${LONG}`, "--debug-token", LONG, "--local-storage", `key=${LONG}`]);
  expect(parsed.errors).toEqual([]);
  expect(JSON.stringify({ actions: parsed.actions, debugToken: parsed.debugToken, localStorage: parsed.localStorage })).not.toContain(LONG);
  expect(scrubPrivateText(LONG)).toBe(LONG);
});

test("a raw dump loses a value in every string, and keeps its shape", () => {
  using _values = revealed(LONG);
  expect(scrubPrivateJson({ url: `https://x/?q=${LONG}`, nested: [{ text: LONG }], size: 7, flag: true })).toEqual({
    url: `https://x/?q=${PRIVATE_MASK}`,
    nested: [{ text: PRIVATE_MASK }],
    size: 7,
    flag: true,
  });
});

test("a dump on disk is scrubbed in place, and one that cannot be rewritten is removed, not kept raw", async ({ scratch }) => {
  using _values = revealed(LONG);
  const path = join(scratch, "page.heapsnapshot");
  await writeFile(path, `{"strings":["${LONG}","kept"]}`);
  await scrubPrivateFile(path);
  expect(await readFile(path, "utf8")).toBe(`{"strings":["${PRIVATE_MASK}","kept"]}`);

  const locked = join(scratch, "locked.heapsnapshot");
  await writeFile(locked, `{"strings":["${LONG}"]}`);
  await chmod(locked, READ_ONLY);
  await expect(scrubPrivateFile(locked)).rejects.toThrow(/EACCES/u);
  expect(existsSync(locked)).toBe(false);
});
