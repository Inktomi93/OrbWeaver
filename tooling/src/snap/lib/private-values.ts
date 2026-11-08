// Scrub by value where structure cannot reach. Playwright records every fill and init-script seed verbatim and a page can
// echo what it was given, so a value is noted as it is revealed and replaced where page text enters snap. Never sweep a
// finished file or a printed line: a typed word would rewrite the enums, paths and RESULT pairs beside it.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPlainObject } from "@orb/kit/guards";
import { unzipSync, zipSync } from "fflate";
import type { DiskSafeText, PrivateText } from "../contract/disk-safe-argv.ts";
import { PRIVATE_MASK } from "../contract/disk-safe-argv.ts";

/** Shorter text is replaced only where it is a whole string: a value like `a` would otherwise rewrite the evidence. */
const SUBSTRING_MIN_CHARS = 4;
const JSON_LINE_ENTRY = /\.(?:trace|network)$/u;
const PIXEL_ENTRY = /\.(?:jpe?g|png|webp)$/u;
const TRACE_SCRATCH_PREFIX = "orb-snap-trace-";
const RAW_TRACE_NAME = "raw.zip";
const UNREADABLE_LINE = Symbol("unreadable trace line");

// A process runs one operator's calls, and one trace spans them, so what was revealed stays noted for the process.
const wholeStrings = new Set<string>();
let substrings: readonly string[] = [];

const jsonSpelling = (text: string): string => JSON.stringify(text).slice(1, -1);
const formSpelling = (text: string): string => new URLSearchParams({ v: text }).toString().slice(2);

// A page sends a value on as JSON, as a URL or as a form, and these nest: a tRPC GET puts JSON in a URL, and a logged
// request puts JSON in JSON. Each of those spells a real password differently.
function spellingsOf(value: string): readonly string[] {
  const json = jsonSpelling(value);
  return [value, json, jsonSpelling(json)].flatMap((text) => [text, encodeURI(text), encodeURIComponent(text), formSpelling(text)]);
}

function notePrivateValue(value: string): void {
  if (value === "") {
    return;
  }
  const spellings = spellingsOf(value);
  for (const spelling of spellings) {
    wholeStrings.add(spelling);
  }
  if (value.length >= SUBSTRING_MIN_CHARS) {
    // Longest first: a noted value inside a longer one would otherwise leave the longer one's tail behind.
    substrings = [...new Set([...substrings, ...spellings])].toSorted((left, right) => right.length - left.length);
  }
}

class PrivateValue implements PrivateText {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    notePrivateValue(this.#value);
    return this.#value;
  }

  equals(other: PrivateText): boolean {
    return other instanceof PrivateValue && other.#value === this.#value;
  }

  toJSON(): string {
    return PRIVATE_MASK;
  }

  toString(): string {
    return PRIVATE_MASK;
  }
}

/** Hold a value an operator handed snap in private. The only mint of {@link PrivateText}. */
export function privateText(value: string): PrivateText {
  return new PrivateValue(value);
}

/** Replace every revealed private value in text read back from a page. The only mint of {@link DiskSafeText}. */
export function scrubPrivateText(text: string): DiskSafeText {
  if (wholeStrings.has(text)) {
    return PRIVATE_MASK as DiskSafeText;
  }
  let scrubbed = text;
  for (const spelling of substrings) {
    scrubbed = scrubbed.replaceAll(spelling, PRIVATE_MASK);
  }
  return scrubbed as DiskSafeText;
}

/**
 * Scrub a thrown error's message and stack in place, keeping its class, before a crash path prints it.
 *
 * @remarks A Playwright error quotes the URL or the text it was handed, so an uncaught one carries every value noted so far.
 */
export function scrubPrivateError(error: unknown): unknown {
  if (error instanceof Error) {
    error.message = scrubPrivateText(error.message);
    if (error.stack !== undefined) {
      error.stack = scrubPrivateText(error.stack);
    }
  }
  return error;
}

// String values only: a key or a `true` that happens to equal a typed value stays, or the line stops being JSON.
function scrubJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubPrivateText(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrubJsonValue);
  }
  return isPlainObject(value) ? Object.fromEntries(Object.entries(value).map(([key, member]) => [key, scrubJsonValue(member)])) : value;
}

function parsedTraceLine(line: string): unknown {
  // the sentinel makes scrubJsonLine throw its fixed refusal, so no trace is kept. The parser's own message is dropped because it quotes the line, and the line is the private text. Ends if scrubJsonLine stops refusing it.
  try {
    return JSON.parse(line);
  } catch {
    return UNREADABLE_LINE;
  }
}

function scrubJsonLine(line: string): string {
  if (line === "") {
    return line;
  }
  const parsed = parsedTraceLine(line);
  if (parsed === UNREADABLE_LINE) {
    throw new Error("INSTRUMENT ERROR: a trace line could not be read, so the trace was not kept");
  }
  return JSON.stringify(scrubJsonValue(parsed));
}

function scrubJsonLines(bytes: Uint8Array): Uint8Array {
  return new TextEncoder().encode(new TextDecoder().decode(bytes).split("\n").map(scrubJsonLine).join("\n"));
}

function replaceBytes(bytes: Buffer, needle: Buffer, mask: Buffer): Buffer {
  const parts: Buffer[] = [];
  let from = 0;
  for (let at = bytes.indexOf(needle); at >= 0; at = bytes.indexOf(needle, from)) {
    parts.push(bytes.subarray(from, at), mask);
    from = at + needle.length;
  }
  return from === 0 ? bytes : Buffer.concat([...parts, bytes.subarray(from)]);
}

// By bytes, not by decoded text: a resource may be any bytes, and a heap snapshot can outgrow the longest string V8 holds.
function scrubBytes(bytes: Uint8Array): Buffer {
  const mask = Buffer.from(PRIVATE_MASK, "utf8");
  return substrings.reduce<Buffer>((scrubbed, spelling) => replaceBytes(scrubbed, Buffer.from(spelling, "utf8"), mask), Buffer.from(bytes));
}

function scrubTraceEntry(name: string, bytes: Uint8Array): Uint8Array {
  if (PIXEL_ENTRY.test(name)) {
    return bytes;
  }
  return JSON_LINE_ENTRY.test(name) ? scrubJsonLines(bytes) : scrubBytes(bytes);
}

/**
 * Stop a tracing context into `path` and scrub it, the only way a kept trace is written.
 *
 * @remarks The raw zip holds the values, so it lands in a private scratch folder, never in the run slot. `path` only ever
 * receives scrubbed bytes, so a failed scrub or a killed process leaves no raw trace where a run's evidence is read.
 */
export async function stopTraceToFile(tracing: { readonly stop: (options: { readonly path: string }) => Promise<void> }, path: string): Promise<void> {
  if (wholeStrings.size === 0) {
    await tracing.stop({ path });
    return;
  }
  const scratch = await mkdtemp(join(tmpdir(), TRACE_SCRATCH_PREFIX));
  try {
    const raw = join(scratch, RAW_TRACE_NAME);
    await tracing.stop({ path: raw });
    const entries = unzipSync(await readFile(raw));
    await writeFile(path, zipSync(Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, scrubTraceEntry(name, bytes)]))));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Scrub every string of a raw protocol dump.
 *
 * @remarks For a dump that holds no vocabulary of snap's own. Structured evidence scrubs where its text enters instead.
 */
export function scrubPrivateJson<T>(value: T): T {
  return wholeStrings.size === 0 ? value : (scrubJsonValue(value) as T);
}

/**
 * Scrub a raw dump already on disk, in place.
 *
 * @throws The read or write failure, after removing the file: a dump that cannot be scrubbed is not kept.
 */
export async function scrubPrivateFile(path: string): Promise<void> {
  if (wholeStrings.size === 0) {
    return;
  }
  // the failure is rethrown to the capture that owns the file, which reports it. Ends if the catch stops rethrowing.
  try {
    await writeFile(path, scrubBytes(await readFile(path)));
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
}

/** Test seam: forget what this process revealed, because Node suites share one module registry per worker. */
export function __resetPrivateValues(): void {
  wholeStrings.clear();
  substrings = [];
}
