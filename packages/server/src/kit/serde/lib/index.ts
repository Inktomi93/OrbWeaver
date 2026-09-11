// THE SPINE every orb-native portable JSON serde is defined through (the F4/F6/F7 killer). Before this
// file each family hand-cloned the same skeleton — the `{schemaKind, schemaVersion}` envelope object (x4),
// `decodeJson` (x4, verbatim), the drop-bad-rows loop (x3), the `TextEncoder(JSON.stringify(w, null, 2))`
// emit (x4) — and every clone was a fresh chance to drift a POLICY. It did: world-info spelled the version
// key `version`, persona shipped no envelope at all, three of four families dropped a bad row while
// world-info failed the whole file, and all four validated `schemaVersion` as "any positive int" and then
// parsed with v1 semantics regardless (no refuse-newer). This file owns all of it ONCE.
//
// WHAT THE SPINE OWNS: the envelope (emit + read, `@orb/contracts/portability`'s `PortableEnvelope`), JSON
// decode, the VERSION GATE (accept `<=` mine, refuse newer as a typed reason), the row loop + its declared
// policy, and the deterministic 2-space emit. What it does NOT own: the per-family canonical shape and its
// row/body zod schemas — those stay in the family's serde file, which is still the ONE home where build and
// parse sit side by side.
//
// TWO FACTORIES, ONE CORE — the tree's families are two shapes, not one:
//   • `defineJsonRowsSerde` — a file that carries a ROW COLLECTION (themes, tags, gallery items, world-info
//     entries, databank documents). `rowPolicy` is a REQUIRED literal, never defaulted: "drop" is the ruled
//     default (O-8 — one bad row must not kill a 200-row restore) and "reject-file" is world-info's declared
//     opt-in (entry integrity matters more than partial recovery for a lorebook).
//   • `defineJsonObjectSerde` — a file that IS one object (a persona, one regex script, a settings blob).
//
// EXTERNAL-ARTIFACT REPAIR (ruled): portable files are artifacts users already hold on disk — NO-LEGACY
// governs the DB, not them. So parse is accept-old-FOREVER and build is emit-new: `legacyVersionKeys` keeps
// reading world-info's `version`, `envelopeOptional` keeps reading the envelope-less persona/regex files
// that shipped before the spine, and both families now EMIT the uniform envelope.

import type { PortableEnvelope, PortableParse, PortableParseFailure } from "@orb/contracts/portability";
import { isPlainObject } from "@orb/kit/guards";
import { z } from "zod";

const ENC = new TextEncoder();
// FATAL DECODE (#1460) — the default `TextDecoder()` is `fatal: false`, which replaces a malformed UTF-8
// byte sequence with U+FFFD and keeps going: the corrupted string can still pass `JSON.parse`, so a
// corrupted artifact "imports successfully" with silently altered text (names/content/metadata/secrets).
// `fatal: true` makes a byte-level corruption THROW instead, which `decodeObject`'s catch turns into the
// typed `invalid-encoding` refusal — never a thrown `TypeError` escaping to the caller as an unhandled 500.
const DEC = new TextDecoder("utf-8", { fatal: true });
const JSON_INDENT = 2;
/** The version an envelope-less legacy file is read as (the shape that predates the envelope). */
const IMPLIED_LEGACY_VERSION = 1;

/** How a malformed member of a file's row collection is handled. A DECLARED choice per family — the drift
 *  F7 named was that the split existed and was never ruled. */
export type JsonSerdeRowPolicy = "drop" | "reject-file";

/** A family's serde: the envelope constants it stamps, plus the two directions over its canonical value. */
export interface JsonSerde<Value> {
  readonly schemaKind: string;
  readonly schemaVersion: number;
  /** Serialize the canonical value to the portable file bytes (the inverse of `parse`). Deterministic key
   *  order, so a re-serialize is byte-identical. */
  readonly build: (value: Value) => Uint8Array;
  /** Parse untrusted file bytes. NEVER throws — a refusal is a typed reason (the per-file isolation the
   *  delivery core depends on). */
  readonly parse: (bytes: Uint8Array) => PortableParse<Value>;
}

/** The empty top-level header — the families whose file is exactly `envelope + rows`. */
export type EmptyJsonHeader = Record<never, never>;

/** Envelope-side spec shared by both factories. */
interface EnvelopeSpec {
  /** The wire discriminant (`orb.theme`, `orb.gallery`, …) — what fences this file from every other family. */
  readonly schemaKind: string;
  /** The version this build emits, and the ceiling parse accepts. */
  readonly schemaVersion: number;
  /** Version keys accepted BESIDES `schemaVersion`, forever (world-info's `version`). */
  readonly legacyVersionKeys?: readonly string[];
  /** True when a file with NO envelope is still accepted (persona / regex shipped envelope-less). Build
   *  always emits the envelope regardless. */
  readonly envelopeOptional?: boolean;
}

export interface JsonRowsSerdeSpec<Value, Row, Header> extends EnvelopeSpec {
  /** The wire key holding the row array (`themes`, `tags`, `items`, `entries`, `documents`). */
  readonly plural: string;
  readonly rowSchema: z.ZodType<Row>;
  readonly rowPolicy: JsonSerdeRowPolicy;
  /** The top-level fields beside the envelope and the row array (world-info's `name`/`description`).
   *  `noJsonHeader()` for the families that have none. */
  readonly headerSchema: z.ZodType<Header>;
  readonly toWire: (value: Value) => { readonly header: Header; readonly rows: readonly unknown[] };
  readonly fromWire: (rows: readonly Row[], header: Header) => Value;
}

export interface JsonObjectSerdeSpec<Value, Body extends object> extends EnvelopeSpec {
  /** Parses the whole body (the envelope keys are stripped before it runs). */
  readonly bodySchema: z.ZodType<Body>;
  readonly toWire: (value: Value) => Body;
  readonly fromWire: (body: Body) => Value;
}

/** Operator-facing copy per refusal reason. One home, so every family's import outcome says the same thing
 *  about the same failure — including the one the old uniform "not a valid X file" hid: a backup written by
 *  a NEWER orbweaver. */
const PARSE_FAILURE_COPY: Record<PortableParseFailure, (kind: string) => string> = {
  "not-json": () => "the file is not JSON",
  "invalid-encoding": () => "the file is corrupted — it is not valid UTF-8 text",
  "foreign-kind": (kind) => `the file is not an ${kind} file`,
  "newer-version": (kind) => `the file was written by a newer version of orbweaver (${kind}) — upgrade before restoring it`,
  malformed: (kind) => `the file's contents do not match the ${kind} format`,
};

/** The operator-facing sentence for a refusal — what an import door renders. */
export function portableParseError(schemaKind: string, reason: PortableParseFailure): string {
  return PARSE_FAILURE_COPY[reason](schemaKind);
}

function refuse<T>(reason: PortableParseFailure): PortableParse<T> {
  return { ok: false, reason };
}

/** The bytes as a plain JSON object, or the reason they are not one. Byte fidelity is checked BEFORE JSON
 *  syntax (#1460): a fatal-decode failure (malformed UTF-8) is `invalid-encoding`, distinct from a
 *  well-formed-bytes-but-bad-syntax `not-json` — conflating them would report "not JSON" for bytes that
 *  never even reached `JSON.parse`, and would silently let a corrupted-but-decodable file through under
 *  the OLD non-fatal decoder (`DEC`'s header). */
function decodeObject(bytes: Uint8Array): PortableParse<Record<string, unknown>> {
  let text: string;
  // @orb-waive caught-failure-ownership(catch): typed refusal — returns a PortableParse
  // "invalid-encoding" reason, consumed via portableParseError for the operator-facing message. Ends if the
  // caller stops rendering the reason.
  try {
    text = DEC.decode(bytes);
  } catch {
    return refuse("invalid-encoding");
  }
  let raw: unknown;
  // @orb-waive caught-failure-ownership(catch): typed refusal — returns a PortableParse
  // "not-json" reason, consumed via portableParseError for the operator-facing message. Ends if the
  // caller stops rendering the reason.
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse("not-json");
  }
  return isPlainObject(raw) ? { ok: true, value: raw } : refuse("not-json");
}

/** The declared version of a decoded file: `schemaVersion`, else the first present legacy key, else (only
 *  for an envelope-less legacy file) the implied v1. */
function readVersion(raw: Record<string, unknown>, spec: EnvelopeSpec, hasKind: boolean): number | null {
  for (const key of ["schemaVersion", ...(spec.legacyVersionKeys ?? [])]) {
    const value = raw[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (value !== undefined) {
      return null; // present but not a version — a malformed envelope, never a silent v1
    }
  }
  return hasKind ? null : IMPLIED_LEGACY_VERSION;
}

/** Read + gate the envelope. `null` = the envelope is acceptable; otherwise the refusal reason. */
function checkEnvelope(raw: Record<string, unknown>, spec: EnvelopeSpec): PortableParseFailure | null {
  const kind = raw["schemaKind"];
  const hasKind = kind !== undefined;
  if (hasKind ? kind !== spec.schemaKind : spec.envelopeOptional !== true) {
    return "foreign-kind";
  }
  const version = readVersion(raw, spec, hasKind);
  if (version === null) {
    return "malformed";
  }
  // The lift-walk key, used as one: a file from a FUTURE writer is refused by name rather than parsed with
  // today's semantics and silently half-restored.
  return version > spec.schemaVersion ? "newer-version" : null;
}

function envelopeOf(spec: EnvelopeSpec): PortableEnvelope {
  return { schemaKind: spec.schemaKind, schemaVersion: spec.schemaVersion };
}

function emit(wire: object): Uint8Array {
  return ENC.encode(JSON.stringify(wire, null, JSON_INDENT));
}

/** The two row policies, as the one exhaustive dispatch (§5.5). `null` = the file is refused. */
type RowCollector = <Row>(raw: readonly unknown[], schema: z.ZodType<Row>) => readonly Row[] | null;

/** A single malformed row is dropped, never fatal — the bundle's isolation philosophy at row granularity. */
const collectDropping: RowCollector = <Row>(raw: readonly unknown[], schema: z.ZodType<Row>): readonly Row[] => {
  const out: Row[] = [];
  for (const candidate of raw) {
    const row = schema.safeParse(candidate);
    if (row.success) {
      out.push(row.data);
    }
  }
  return out;
};

/** Declared opt-in: the collection is an integral whole (a lorebook with a silently-missing entry is worse
 *  than a refused file, because the book still LOOKS complete). */
const collectRejecting: RowCollector = <Row>(raw: readonly unknown[], schema: z.ZodType<Row>): readonly Row[] | null => {
  const out: Row[] = [];
  for (const candidate of raw) {
    const row = schema.safeParse(candidate);
    if (!row.success) {
      return null;
    }
    out.push(row.data);
  }
  return out;
};

const COLLECT_ROWS: Record<JsonSerdeRowPolicy, RowCollector> = {
  drop: collectDropping,
  "reject-file": collectRejecting,
};

/** The header schema for a file that is exactly `envelope + rows` (no top-level fields of its own). */
export function noJsonHeader(): z.ZodType<EmptyJsonHeader> {
  return z.object({});
}

/** The empty header value the header-less row families hand `toWire`. */
export const NO_JSON_HEADER: EmptyJsonHeader = {};

/** Define the serde for a portable file that carries a ROW COLLECTION. */
export function defineJsonRowsSerde<Value, Row, Header>(spec: JsonRowsSerdeSpec<Value, Row, Header>): JsonSerde<Value> {
  return {
    schemaKind: spec.schemaKind,
    schemaVersion: spec.schemaVersion,
    build: (value): Uint8Array => {
      const { header, rows } = spec.toWire(value);
      return emit({ ...envelopeOf(spec), ...header, [spec.plural]: rows });
    },
    parse: (bytes): PortableParse<Value> => {
      const decoded = decodeObject(bytes);
      if (!decoded.ok) {
        return decoded;
      }
      const envelopeFailure = checkEnvelope(decoded.value, spec);
      if (envelopeFailure !== null) {
        return refuse(envelopeFailure);
      }
      const rawRows = decoded.value[spec.plural];
      if (!Array.isArray(rawRows)) {
        return refuse("malformed");
      }
      const header = spec.headerSchema.safeParse(decoded.value);
      if (!header.success) {
        return refuse("malformed");
      }
      const rows = COLLECT_ROWS[spec.rowPolicy](rawRows, spec.rowSchema);
      return rows === null ? refuse("malformed") : { ok: true, value: spec.fromWire(rows, header.data) };
    },
  };
}

/** Define the serde for a portable file that IS one object. */
export function defineJsonObjectSerde<Value, Body extends object>(spec: JsonObjectSerdeSpec<Value, Body>): JsonSerde<Value> {
  return {
    schemaKind: spec.schemaKind,
    schemaVersion: spec.schemaVersion,
    build: (value): Uint8Array => emit({ ...envelopeOf(spec), ...spec.toWire(value) }),
    parse: (bytes): PortableParse<Value> => {
      const decoded = decodeObject(bytes);
      if (!decoded.ok) {
        return decoded;
      }
      const envelopeFailure = checkEnvelope(decoded.value, spec);
      if (envelopeFailure !== null) {
        return refuse(envelopeFailure);
      }
      const body = spec.bodySchema.safeParse(decoded.value);
      return body.success ? { ok: true, value: spec.fromWire(body.data) } : refuse("malformed");
    },
  };
}
