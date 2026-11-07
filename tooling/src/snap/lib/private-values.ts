// Scrub by value where structure cannot reach. A Playwright trace records every fill's text and every init-script seed
// verbatim, so the values a run was handed are noted at parse and replaced in each trace before it is kept.
import { readFile, writeFile } from "node:fs/promises";
import { isPlainObject } from "@orb/kit/guards";
import { unzipSync, zipSync } from "fflate";
import type { Args } from "../contract/types.ts";

const TRACE_MASK = "<private>";
/** Shorter text is replaced only where it is a whole string: a value like `a` would otherwise rewrite the evidence. */
const SUBSTRING_MIN_CHARS = 4;
const JSON_LINE_ENTRY = /\.(?:trace|network)$/u;
const PIXEL_ENTRY = /\.(?:jpe?g|png|webp)$/u;

const privateValues = new Set<string>();

/** Note the private values one parsed argv holds. Additive: a session daemon parses each call, and one trace spans them. */
export function notePrivateValues(args: Pick<Args, "debugToken" | "localStorage" | "actions">): void {
  const typed = args.actions.flatMap(({ type, action }) => (type === "step" && action.kind === "fill" ? [action.value] : []));
  for (const value of [args.debugToken, ...args.localStorage.map((seed) => seed.value), ...typed]) {
    if (value !== "") {
      privateValues.add(value);
    }
  }
}

function scrubText(text: string): string {
  let scrubbed = text;
  for (const value of privateValues) {
    if (scrubbed === value) {
      return TRACE_MASK;
    }
    if (value.length >= SUBSTRING_MIN_CHARS) {
      scrubbed = scrubbed.replaceAll(value, TRACE_MASK);
    }
  }
  return scrubbed;
}

// String values only: a key or a `true` that happens to equal a typed value stays, or the line stops being JSON.
function scrubJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubText(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrubJsonValue);
  }
  return isPlainObject(value) ? Object.fromEntries(Object.entries(value).map(([key, member]) => [key, scrubJsonValue(member)])) : value;
}

function scrubJsonLines(bytes: Uint8Array): Uint8Array {
  const lines = new TextDecoder().decode(bytes).split("\n");
  return new TextEncoder().encode(lines.map((line) => (line === "" ? line : JSON.stringify(scrubJsonValue(JSON.parse(line))))).join("\n"));
}

// A resource may be any bytes: latin1 maps each byte to one code unit, so unmatched bytes survive the round trip.
function scrubResource(bytes: Uint8Array): Uint8Array {
  let text = Buffer.from(bytes).toString("latin1");
  for (const value of privateValues) {
    if (value.length >= SUBSTRING_MIN_CHARS) {
      text = text.replaceAll(Buffer.from(value, "utf8").toString("latin1"), TRACE_MASK);
    }
  }
  return Buffer.from(text, "latin1");
}

function scrubTraceEntry(name: string, bytes: Uint8Array): Uint8Array {
  if (PIXEL_ENTRY.test(name)) {
    return bytes;
  }
  return JSON_LINE_ENTRY.test(name) ? scrubJsonLines(bytes) : scrubResource(bytes);
}

/** Stop a tracing context into `path` and scrub the file, the only way a kept trace is written. */
export async function stopTraceToFile(tracing: { readonly stop: (options: { readonly path: string }) => Promise<void> }, path: string): Promise<void> {
  await tracing.stop({ path });
  if (privateValues.size === 0) {
    return;
  }
  const entries = unzipSync(await readFile(path));
  await writeFile(path, zipSync(Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, scrubTraceEntry(name, bytes)]))));
}
