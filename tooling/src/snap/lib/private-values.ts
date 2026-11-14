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

/**
 * How long a value of each kind must be to be replaced inside longer text; a shorter one is replaced only where it is
 * a whole string, or a value like `a` would rewrite the evidence. A `secret` is typed by the operator or named as one
 * (`token`, `password`). A `urlWord` comes from a URL pair named `key` or `code`, which often holds an ordinary word
 * (`?key=home`), so only a value as long as a generated key or code is replaced inside page text.
 */
const SUBSTRING_MIN_CHARS = { secret: 4, urlWord: 16 } as const;

/** What kind of private value a {@link privateText} holds, which sets how short it may be and still be scrubbed inside text. */
export type PrivateValueKind = keyof typeof SUBSTRING_MIN_CHARS;
const TRUNCATION_MARK = "…";
/**
 * Every place Playwright cuts text it writes to a trace or a call log (`trimStringWithEllipsis`, playwright-core 1.64
 * `coreBundle.js`): its cap, and what the text right before the cut text must end with.
 */
const PLAYWRIGHT_CUTS = [
  // an element preview's text: `<tag attrs>TEXT…</tag>`
  { cap: 50, opens: />$/u },
  // an element preview's joined attributes: `<tag ATTRS…>`
  { cap: 500, opens: /<[a-z][^\s<>/]*$/iu },
  // a pending or committed navigation URL in the action log
  { cap: 200, opens: /"$/u },
  // a quoted URL argument in an action title
  { cap: 50, opens: /"$/u },
] as const;
// Enough code points before a cut to read its opener, the longest being an element's tag name.
const CUT_OPENER_LOOKBACK = 64;
const JSON_LINE_ENTRY = /\.(?:trace|network)$/u;
const PIXEL_ENTRY = /\.(?:jpe?g|png|webp)$/u;
const TRACE_SCRATCH_PREFIX = "orb-snap-trace-";
const RAW_TRACE_NAME = "raw.zip";
const UNREADABLE_LINE = Symbol("unreadable trace line");

// What was revealed stays noted until the host forgets it (`forgetPrivateValues`), which it does when each run ends, a
// one-shot CLI run included; a session daemon's run spans its whole life, so one trace keeps every call's values. A throw
// detected after the run ends prints with nothing noted.
const wholeStrings = new Set<string>();
let substrings: readonly string[] = [];
// The fewest leading characters of a spelling that count as a cut copy of it: its kind's floor inside text.
const prefixFloors = new Map<string, number>();

const jsonSpelling = (text: string): string => JSON.stringify(text).slice(1, -1);
const formSpelling = (text: string): string => new URLSearchParams({ v: text }).toString().slice(2);

// A page sends a value on as JSON, as a URL or as a form, and these nest: a tRPC GET puts JSON in a URL, and a logged
// request puts JSON in JSON. Each of those spells a real password differently.
function spellingsOf(value: string): readonly string[] {
  const json = jsonSpelling(value);
  return [value, json, jsonSpelling(json)].flatMap((text) => [text, encodeURI(text), encodeURIComponent(text), formSpelling(text)]);
}

function notePrivateValue(value: string, kind: PrivateValueKind): void {
  if (value === "") {
    return;
  }
  const spellings = spellingsOf(value);
  for (const spelling of spellings) {
    wholeStrings.add(spelling);
  }
  const floor = SUBSTRING_MIN_CHARS[kind];
  if (value.length >= floor) {
    // Longest first: a noted value inside a longer one would otherwise leave the longer one's tail behind.
    substrings = [...new Set([...substrings, ...spellings])].toSorted((left, right) => right.length - left.length);
    for (const spelling of spellings) {
      prefixFloors.set(spelling, Math.min(prefixFloors.get(spelling) ?? floor, floor));
    }
  }
}

class PrivateValue implements PrivateText {
  readonly #value: string;
  readonly #kind: PrivateValueKind;

  constructor(value: string, kind: PrivateValueKind) {
    this.#value = value;
    this.#kind = kind;
  }

  reveal(): string {
    notePrivateValue(this.#value, this.#kind);
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
export function privateText(value: string, kind: PrivateValueKind = "secret"): PrivateText {
  return new PrivateValue(value, kind);
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

// The longest prefix of a noted spelling that `window` ends with, each spelling at its own kind's floor, or 0.
function notedPrefixLength(window: string): number {
  let longest = 0;
  for (const spelling of substrings) {
    const floor = prefixFloors.get(spelling) ?? spelling.length;
    for (let length = Math.min(spelling.length, window.length); length >= Math.max(longest + 1, floor); length -= 1) {
      if (window.endsWith(spelling.slice(0, length))) {
        longest = length;
        break;
      }
    }
  }
  return longest;
}

// How many UTF-16 units of a noted value Playwright left right before the ellipsis at code point `end` of `points`, or 0
// when no cut of its own ends there. A cut keeps exactly `cap - 1` code points after its opener, so ordinary text that
// ends in an ellipsis is never judged.
function cutPrefixAt(points: readonly string[], end: number): number {
  let longest = 0;
  for (const { cap, opens } of PLAYWRIGHT_CUTS) {
    const start = end - (cap - TRUNCATION_MARK.length);
    if (start < 0 || !opens.test(points.slice(Math.max(0, start - CUT_OPENER_LOOKBACK), start).join(""))) {
      continue;
    }
    longest = Math.max(longest, notedPrefixLength(points.slice(start, end).join("")));
  }
  return longest;
}

// The windows are found on the raw text: a whole-value replacement first would change the code-point count of a cut.
// The text is split into code points once, so a string with many ellipses costs one pass, not one per ellipsis.
function scrubPlaywrightCuts(text: string): string {
  const points = Array.from(text);
  const cuts: { readonly unit: number; readonly length: number }[] = [];
  let unit = 0;
  for (const [index, point] of points.entries()) {
    if (point === TRUNCATION_MARK) {
      const length = cutPrefixAt(points, index);
      if (length > 0) {
        cuts.push({ unit, length });
      }
    }
    unit += point.length;
  }
  return cuts.reduceRight((scrubbed, cut) => `${scrubbed.slice(0, cut.unit - cut.length)}${PRIVATE_MASK}${scrubbed.slice(cut.unit)}`, text);
}

/**
 * {@link scrubPrivateText} for text Playwright wrote: a trace line or an error with its call log. It also masks a noted
 * value Playwright cut short, which survives only as its prefix.
 */
export function scrubPlaywrightText(text: string): DiskSafeText {
  return scrubPrivateText(text.includes(TRUNCATION_MARK) && substrings.length > 0 ? scrubPlaywrightCuts(text) : text);
}

/**
 * Scrub a thrown error's message and stack in place, keeping its class, before a crash path prints it.
 *
 * @remarks A Playwright error quotes the URL or the text it was handed, so an uncaught one carries every value noted so far.
 */
export function scrubPrivateError(error: unknown): unknown {
  if (error instanceof Error) {
    error.message = scrubPlaywrightText(error.message);
    if (error.stack !== undefined) {
      error.stack = scrubPlaywrightText(error.stack);
    }
  }
  return error;
}

// String values only: a key or a `true` that happens to equal a typed value stays, or the line stops being JSON.
function scrubJsonValue(value: unknown, scrub: (text: string) => DiskSafeText): unknown {
  if (typeof value === "string") {
    return scrub(value);
  }
  if (Array.isArray(value)) {
    return value.map((member) => scrubJsonValue(member, scrub));
  }
  return isPlainObject(value) ? Object.fromEntries(Object.entries(value).map(([key, member]) => [key, scrubJsonValue(member, scrub)])) : value;
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
  return JSON.stringify(scrubJsonValue(parsed, scrubPlaywrightText));
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
  return wholeStrings.size === 0 ? value : (scrubJsonValue(value, scrubPrivateText) as T);
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

/** Forget what this process revealed. A host that runs several invocations in one process calls it after each, so
 *  a value one invocation revealed is never scrubbed from the next one's evidence. */
export function forgetPrivateValues(): void {
  wholeStrings.clear();
  substrings = [];
  prefixFloors.clear();
}
