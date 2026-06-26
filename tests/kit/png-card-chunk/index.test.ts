// biome-ignore-all lint/suspicious/noBitwiseOperators: an independent reference CRC-32 (textbook
// bit-shift form) is used to cross-check the codec's emitted CRC against the canonical polynomial.
import { isPng, readCardChunk, writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect, test } from "vitest";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IEND_TYPE_BYTES = [0x49, 0x45, 0x4e, 0x44]; // "IEND"
const TEXT_TYPE_BYTES = [0x74, 0x45, 0x58, 0x74]; // "tEXt"

/** A minimal-but-valid PNG: signature + a zero-length IEND chunk (CRC ignored by the reader). */
function makeBasePng(): Uint8Array {
  return Uint8Array.from([...PNG_SIG, 0, 0, 0, 0, ...IEND_TYPE_BYTES, 0, 0, 0, 0]);
}

function ascii(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return s;
}

interface Chunk {
  type: string;
  keyword: string;
  data: Uint8Array;
  crc: number;
}

/** Walk a PNG into its chunks (type, tEXt keyword, payload, stored CRC). */
function walk(png: Uint8Array): Chunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let off = 8;
  while (off + 8 <= png.length) {
    const len = view.getUint32(off, false);
    if (off + 12 + len > png.length) {
      break;
    }
    const type = ascii(png.subarray(off + 4, off + 8));
    const data = png.subarray(off + 8, off + 8 + len);
    const crc = view.getUint32(off + 8 + len, false);
    const nul = data.indexOf(0);
    const keyword = type === "tEXt" && nul >= 0 ? ascii(data.subarray(0, nul)) : "";
    chunks.push({ type, keyword, data, crc });
    off += 12 + len;
  }
  return chunks;
}

// Build a V3-shaped card as a JSON STRING (keeps the snake_case `spec_version` inside a string,
// not as an identifier biome's useNamingConvention would reject).
function v3Json(name: string): string {
  return `{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":${JSON.stringify(name)}}}`;
}

/** Canonical CRC-32 (reflected, poly 0xEDB88320, init/xorout 0xFFFFFFFF) — independent of the codec. */
function refCrc32(bytes: Uint8Array): number {
  let c = 0xff_ff_ff_ff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xff_ff_ff_ff) >>> 0;
}

test("the reference CRC-32 matches the published check value for '123456789'", () => {
  const msg = Uint8Array.from([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
  expect(refCrc32(msg)).toBe(0xcb_f4_39_26);
});

test("isPng recognizes the 8-byte signature and rejects everything else", () => {
  expect(isPng(makeBasePng())).toBe(true);
  expect(isPng(Uint8Array.from([1, 2, 3]))).toBe(false);
  expect(isPng(Uint8Array.from(PNG_SIG.slice(0, 7)))).toBe(false);
  const corrupt = makeBasePng();
  corrupt[0] = 0;
  expect(isPng(corrupt)).toBe(false);
});

test("write→read round-trips the V3 (ccv3) JSON, including non-ASCII UTF-8", () => {
  const json = v3Json("José ☃ 🎲");
  const out = writeCardChunk(makeBasePng(), json);
  expect(readCardChunk(out, "ccv3")).toBe(json);
});

test("readCardChunk matches the keyword case-insensitively", () => {
  const json = v3Json("X");
  const out = writeCardChunk(makeBasePng(), json);
  expect(readCardChunk(out, "CCV3")).toBe(json);
});

test("the V2 (chara) chunk has the spec/spec_version envelope stripped", () => {
  const json = v3Json("X");
  const out = writeCardChunk(makeBasePng(), json);
  const v2 = readCardChunk(out, "chara");
  expect(v2).not.toBeNull();
  expect(JSON.parse(v2 ?? "")).toStrictEqual({ data: { name: "X" } });
});

test("a non-object card is written verbatim to both chunks (no stripping)", () => {
  const json = '"just a string"';
  const out = writeCardChunk(makeBasePng(), json);
  expect(readCardChunk(out, "ccv3")).toBe(json);
  expect(readCardChunk(out, "chara")).toBe(json);
});

test("dual-chunk ORDER is chara (V2), then ccv3 (V3), then IEND", () => {
  const json = v3Json("X");
  const labels = walk(writeCardChunk(makeBasePng(), json)).map((c) =>
    c.type === "tEXt" ? c.keyword : c.type,
  );
  expect(labels.indexOf("chara")).toBeLessThan(labels.indexOf("ccv3"));
  expect(labels.indexOf("ccv3")).toBeLessThan(labels.indexOf("IEND"));
});

test("re-writing drops the stale card chunks (exactly one ccv3; same length as a fresh write)", () => {
  const base = makeBasePng();
  const v1 = writeCardChunk(base, JSON.stringify({ data: { name: "old" } }));
  const json2 = JSON.stringify({ data: { name: "new" } });
  const v2 = writeCardChunk(v1, json2);
  const fresh = writeCardChunk(base, json2);
  expect(v2.length).toBe(fresh.length);
  expect(readCardChunk(v2, "ccv3")).toBe(json2);
  const ccv3Count = walk(v2).filter((c) => c.type === "tEXt" && c.keyword === "ccv3").length;
  expect(ccv3Count).toBe(1);
});

test("the emitted tEXt CRC matches an independent canonical CRC-32 over type+data", () => {
  const json = JSON.stringify({ data: { name: "crc" } });
  const out = writeCardChunk(makeBasePng(), json);
  const text = walk(out).find((c) => c.type === "tEXt");
  expect(text).toBeDefined();
  const typeAndData = Uint8Array.from([...TEXT_TYPE_BYTES, ...(text?.data ?? new Uint8Array())]);
  expect(text?.crc).toBe(refCrc32(typeAndData));
});

test("readCardChunk returns null for non-PNG, a missing keyword, and truncation", () => {
  expect(readCardChunk(Uint8Array.from([1, 2, 3]), "ccv3")).toBeNull();
  expect(readCardChunk(makeBasePng(), "ccv3")).toBeNull();
  const out = writeCardChunk(makeBasePng(), JSON.stringify({ data: {} }));
  // ccv3 sits immediately before the 12-byte IEND; cutting past IEND truncates ccv3's payload, so the
  // walk hits its "declared length runs past the buffer" guard and bails → null.
  expect(readCardChunk(out.subarray(0, out.length - 13), "ccv3")).toBeNull();
});

test("writeCardChunk throws on a non-PNG and on a PNG with no IEND", () => {
  expect(() => writeCardChunk(Uint8Array.from([1, 2, 3]), "{}")).toThrow("not a PNG");
  const noIend = Uint8Array.from([...PNG_SIG, 0, 0, 0, 1, ...TEXT_TYPE_BYTES, 0x41, 0, 0, 0, 0]);
  expect(() => writeCardChunk(noIend, "{}")).toThrow("IEND");
});
