// A reader for the gzipped pprof profiles the TypeScript 7.1 server writes (api.debug): each function's own (flat) and
// inclusive (cumulative) share of one sample type, from the profile.proto wire format.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/** One function's share of a profile's sample type. */
interface PprofEntry {
  readonly name: string;
  readonly flat: number;
  readonly cumulative: number;
}

export interface PprofSummary {
  /** The sample type read, as `type/unit`. */
  readonly sampleType: string;
  readonly total: number;
  /** Every function, by cumulative share. */
  readonly entries: readonly PprofEntry[];
}

// profile.proto field numbers.
const PROFILE = { sampleType: 1, sample: 2, location: 4, function: 5, stringTable: 6 } as const;
const VALUE_TYPE = { type: 1, unit: 2 } as const;
const SAMPLE = { locationId: 1, value: 2 } as const;
const LOCATION = { id: 1, line: 4 } as const;
const LINE = { functionId: 1 } as const;
const FUNCTION = { id: 1, name: 2 } as const;

const WIRE = { varint: 0, fixed64: 1, bytes: 2, fixed32: 5 } as const;
const FIXED64_BYTES = 8;
const FIXED32_BYTES = 4;
// A varint byte carries seven bits and a continuation flag above them; a field key holds the wire type below three bits.
const VARINT_BASE = 128;
const WIRE_BASE = 8;

type Field = { readonly field: number; readonly value: number } | { readonly field: number; readonly bytes: Uint8Array };

// Reads one varint at `at`; a profile's values stay below 2^53, so a number holds them.
function varint(bytes: Uint8Array, at: { offset: number }): number {
  let value = 0;
  let scale = 1;
  for (;;) {
    const byte = bytes[at.offset] ?? 0;
    at.offset += 1;
    value += (byte % VARINT_BASE) * scale;
    if (byte < VARINT_BASE) {
      return value;
    }
    scale *= VARINT_BASE;
  }
}

function* fields(bytes: Uint8Array): Generator<Field> {
  const at = { offset: 0 };
  while (at.offset < bytes.length) {
    const key = varint(bytes, at);
    const field = Math.floor(key / WIRE_BASE);
    const wire = key % WIRE_BASE;
    if (wire === WIRE.varint) {
      yield { field, value: varint(bytes, at) };
    } else if (wire === WIRE.bytes) {
      const length = varint(bytes, at);
      yield { field, bytes: bytes.subarray(at.offset, at.offset + length) };
      at.offset += length;
    } else if (wire === WIRE.fixed64) {
      at.offset += FIXED64_BYTES;
    } else if (wire === WIRE.fixed32) {
      at.offset += FIXED32_BYTES;
    } else {
      throw new Error(`pprof: wire type ${String(wire)} is not in profile.proto`);
    }
  }
}

// A repeated integer field, packed or not.
function integers(entry: Field): readonly number[] {
  if ("value" in entry) {
    return [entry.value];
  }
  const out: number[] = [];
  const at = { offset: 0 };
  while (at.offset < entry.bytes.length) {
    out.push(varint(entry.bytes, at));
  }
  return out;
}

const integer = (entry: Field): number => ("value" in entry ? entry.value : 0);
const message = (entry: Field): Uint8Array => ("bytes" in entry ? entry.bytes : new Uint8Array());

interface Parsed {
  readonly strings: string[];
  readonly sampleTypes: (readonly [number, number])[];
  readonly samples: { readonly locations: readonly number[]; readonly values: readonly number[] }[];
  readonly functionOfLocation: Map<number, number>;
  readonly nameOfFunction: Map<number, number>;
}

const NO_FIELD: Field = { field: 0, value: 0 };
const partOf = (parts: readonly Field[], field: number): Field | undefined => parts.find((part) => part.field === field);
const DECODER = new TextDecoder();

// What each top-level profile field adds to the parse.
const READERS: Readonly<Record<number, (into: Parsed, parts: readonly Field[], entry: Field) => void>> = {
  [PROFILE.stringTable]: (into, _parts, entry) => {
    into.strings.push(DECODER.decode(message(entry)));
  },
  [PROFILE.sampleType]: (into, parts) => {
    into.sampleTypes.push([integer(partOf(parts, VALUE_TYPE.type) ?? NO_FIELD), integer(partOf(parts, VALUE_TYPE.unit) ?? NO_FIELD)]);
  },
  [PROFILE.sample]: (into, parts) => {
    into.samples.push({
      locations: parts.filter(({ field }) => field === SAMPLE.locationId).flatMap(integers),
      values: parts.filter(({ field }) => field === SAMPLE.value).flatMap(integers),
    });
  },
  [PROFILE.location]: (into, parts) => {
    const id = partOf(parts, LOCATION.id);
    // A location's first line is its innermost frame: an inlined call's own function.
    const line = partOf(parts, LOCATION.line);
    const fn = line === undefined ? undefined : partOf([...fields(message(line))], LINE.functionId);
    if (id !== undefined && fn !== undefined) {
      into.functionOfLocation.set(integer(id), integer(fn));
    }
  },
  [PROFILE.function]: (into, parts) => {
    const id = partOf(parts, FUNCTION.id);
    const name = partOf(parts, FUNCTION.name);
    if (id !== undefined && name !== undefined) {
      into.nameOfFunction.set(integer(id), integer(name));
    }
  },
};

function parse(bytes: Uint8Array): Parsed {
  const parsed: Parsed = { strings: [], sampleTypes: [], samples: [], functionOfLocation: new Map(), nameOfFunction: new Map() };
  for (const entry of fields(bytes)) {
    const reader = READERS[entry.field];
    if (reader !== undefined) {
      reader(parsed, entry.field === PROFILE.stringTable ? [] : [...fields(message(entry))], entry);
    }
  }
  return parsed;
}

const UNKNOWN_FUNCTION = "?";

/** Each function's flat and cumulative share of the first sample type whose name starts with `wanted` (the last
 *  sample type when none does), every function kept, by cumulative share. */
export function readPprof(path: string, wanted: string): PprofSummary {
  const profile = parse(gunzipSync(readFileSync(path)));
  const typeNames = profile.sampleTypes.map(([type, unit]) => `${profile.strings[type] ?? ""}/${profile.strings[unit] ?? ""}`);
  const found = typeNames.findIndex((name) => name.startsWith(wanted));
  const index = found >= 0 ? found : typeNames.length - 1;
  const nameOf = (location: number): string =>
    profile.strings[profile.nameOfFunction.get(profile.functionOfLocation.get(location) ?? -1) ?? -1] ?? UNKNOWN_FUNCTION;
  const flat = new Map<string, number>();
  const cumulative = new Map<string, number>();
  let total = 0;
  for (const { locations, values } of profile.samples) {
    const value = values[index] ?? 0;
    total += value;
    const [leaf] = locations;
    if (leaf !== undefined) {
      flat.set(nameOf(leaf), (flat.get(nameOf(leaf)) ?? 0) + value);
    }
    for (const name of new Set(locations.map(nameOf))) {
      cumulative.set(name, (cumulative.get(name) ?? 0) + value);
    }
  }
  const entries = [...cumulative]
    .map(([name, share]) => ({ name, flat: flat.get(name) ?? 0, cumulative: share }))
    .sort((a, b) => b.cumulative - a.cumulative || b.flat - a.flat || a.name.localeCompare(b.name));
  return { sampleType: typeNames[index] ?? "", total, entries };
}
