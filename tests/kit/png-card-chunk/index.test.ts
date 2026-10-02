import { deflateSync } from "node:zlib";
import { isPng, readCardChunk, stripCardChunks, writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect, test } from "../../support/fixtures.ts";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IEND_TYPE_BYTES = [0x49, 0x45, 0x4e, 0x44]; // "IEND"
const TEXT_TYPE_BYTES = [0x74, 0x45, 0x58, 0x74]; // "tEXt"
const ZTEXT_TYPE_BYTES = [0x7a, 0x54, 0x58, 0x74]; // "zTXt"

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

// biome-ignore-start lint/suspicious/noBitwiseOperators: an independent reference CRC-32 (textbook bit-shift form) is used to cross-check the codec's emitted CRC against the canonical polynomial.
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
// biome-ignore-end lint/suspicious/noBitwiseOperators: end of the block above

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

test("write→read round-trips the V3 (ccv3) JSON, including non-ASCII UTF-8", async () => {
  const json = v3Json("José ☃ 🎲");
  const out = writeCardChunk(makeBasePng(), json);
  expect(await readCardChunk(out, "ccv3")).toBe(json);
});

test("readCardChunk matches the keyword case-insensitively", async () => {
  const json = v3Json("X");
  const out = writeCardChunk(makeBasePng(), json);
  expect(await readCardChunk(out, "CCV3")).toBe(json);
});

test("the V2 (chara) chunk has the spec/spec_version envelope stripped", async () => {
  const json = v3Json("X");
  const out = writeCardChunk(makeBasePng(), json);
  const v2 = await readCardChunk(out, "chara");
  expect(v2).not.toBeNull();
  expect(JSON.parse(v2 ?? "")).toStrictEqual({ data: { name: "X" } });
});

test("a non-object card is written verbatim to both chunks (no stripping)", async () => {
  const json = '"just a string"';
  const out = writeCardChunk(makeBasePng(), json);
  expect(await readCardChunk(out, "ccv3")).toBe(json);
  expect(await readCardChunk(out, "chara")).toBe(json);
});

test("dual-chunk ORDER is chara (V2), then ccv3 (V3), then IEND", () => {
  const json = v3Json("X");
  const labels = walk(writeCardChunk(makeBasePng(), json)).map((c) => (c.type === "tEXt" ? c.keyword : c.type));
  expect(labels.indexOf("chara")).toBeLessThan(labels.indexOf("ccv3"));
  expect(labels.indexOf("ccv3")).toBeLessThan(labels.indexOf("IEND"));
});

test("re-writing drops the stale card chunks (exactly one ccv3; same length as a fresh write)", async () => {
  const base = makeBasePng();
  const v1 = writeCardChunk(base, JSON.stringify({ data: { name: "old" } }));
  const json2 = JSON.stringify({ data: { name: "new" } });
  const v2 = writeCardChunk(v1, json2);
  const fresh = writeCardChunk(base, json2);
  expect(v2.length).toBe(fresh.length);
  expect(await readCardChunk(v2, "ccv3")).toBe(json2);
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

test("readCardChunk returns null for non-PNG, a missing keyword, and truncation", async () => {
  expect(await readCardChunk(Uint8Array.from([1, 2, 3]), "ccv3")).toBeNull();
  expect(await readCardChunk(makeBasePng(), "ccv3")).toBeNull();
  const out = writeCardChunk(makeBasePng(), JSON.stringify({ data: {} }));
  // ccv3 sits immediately before the 12-byte IEND; cutting past IEND truncates ccv3's payload, so the
  // walk hits its "declared length runs past the buffer" guard and bails → null.
  expect(await readCardChunk(out.subarray(0, out.length - 13), "ccv3")).toBeNull();
});

// --- zTXt (compressed) READ — cards exported by tools that compress the chunk -----------------------

/** One well-formed PNG chunk: length(4 BE) + type(4) + body + CRC(4 BE over type+body). */
function chunkBytes(typeBytes: number[], body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length, false);
  out.set(typeBytes, 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, refCrc32(Uint8Array.from([...typeBytes, ...body])), false);
  return out;
}

/** A PNG carrying ONE zTXt chunk: `keyword\0<method byte><zlib(base64(utf8(json)))>` — the exact layout
 *  a compressing exporter emits. `zlib` (not raw deflate) is what the PNG spec's method 0 means. */
function makeZtxtPng(keyword: string, json: string, opts?: { method?: number; corrupt?: boolean }): Uint8Array {
  const b64 = Buffer.from(json, "utf8").toString("base64");
  const compressed = opts?.corrupt === true ? Uint8Array.from([0x78, 0x9c, 1, 2, 3, 4, 5]) : new Uint8Array(deflateSync(Buffer.from(b64, "latin1")));
  const body = Uint8Array.from([...Buffer.from(`${keyword}\0`, "latin1"), opts?.method ?? 0, ...compressed]);
  return Uint8Array.from([...PNG_SIG, ...chunkBytes(ZTEXT_TYPE_BYTES, body), ...chunkBytes(IEND_TYPE_BYTES, new Uint8Array())]);
}

test("a zTXt card decodes to exactly what the same card yields through tEXt", async () => {
  const json = v3Json("José ☃ 🎲");
  const viaZtxt = await readCardChunk(makeZtxtPng("ccv3", json), "ccv3");
  const viaText = await readCardChunk(writeCardChunk(makeBasePng(), json), "ccv3");
  expect(viaZtxt).toBe(json);
  expect(viaZtxt).toBe(viaText);
});

test("zTXt keyword matching is case-insensitive and ignores non-card keywords", async () => {
  expect(await readCardChunk(makeZtxtPng("ccv3", v3Json("X")), "CCV3")).toBe(v3Json("X"));
  // A zTXt "Description" chunk is ordinary PNG metadata — the walk must skip past it, not adopt it.
  expect(await readCardChunk(makeZtxtPng("Description", v3Json("X")), "ccv3")).toBeNull();
});

test("a corrupt zlib stream fails soft to null (the read contract), never throwing", async () => {
  await expect(readCardChunk(makeZtxtPng("ccv3", v3Json("X"), { corrupt: true }), "ccv3")).resolves.toBeNull();
});

test("a zTXt chunk with an undefined compression method is skipped", async () => {
  expect(await readCardChunk(makeZtxtPng("ccv3", v3Json("X"), { method: 1 }), "ccv3")).toBeNull();
});

/** Splice a foreign chunk in FRONT of `png`'s own chunks (i.e. right after the signature). */
function spliceBefore(png: Uint8Array, chunkPng: Uint8Array): Uint8Array {
  const chunk = chunkPng.subarray(8, chunkPng.length - 12); // drop the signature + the trailing IEND
  return Uint8Array.from([...png.subarray(0, 8), ...chunk, ...png.subarray(8)]);
}

test("a NON-CARD zTXt chunk does not stop the walk from finding a later tEXt card", async () => {
  // Renamed to what it covers (#1353): the decoy's keyword is `Comment`, so the walk never MATCHED it and
  // this pinned nothing about card-keyword zTXt. The property its old title claimed is the next test.
  const json = v3Json("X");
  const written = writeCardChunk(makeBasePng(), json);
  expect(await readCardChunk(spliceBefore(written, makeZtxtPng("Comment", json)), "ccv3")).toBe(json);
});

test("a CORRUPT card-keyword zTXt does not shadow a valid tEXt card later in the file", async () => {
  // The real property: a matching-but-unusable `ccv3` zTXt used to END the walk (the payload was taken
  // without inflating and the loop broke), so the whole read answered null even though the card sat two
  // chunks away. Precedence is now "first matching chunk that DECODES wins".
  const json = v3Json("X");
  const written = writeCardChunk(makeBasePng(), json);
  const shadowed = spliceBefore(written, makeZtxtPng("ccv3", v3Json("STALE"), { corrupt: true }));
  expect(await readCardChunk(shadowed, "ccv3")).toBe(json);
});

test("re-writing a zTXt-BEARING png supersedes the compressed card (export returns the NEW card)", async () => {
  // #1353's headline: the write dropped stale `tEXt` only, so an imported card's `zTXt` survived, was
  // re-emitted BEFORE the fresh chunks, and won the file-order read — exporting handed back the card the
  // write had just replaced.
  const oldJson = v3Json("OLD");
  const newJson = v3Json("NEW");
  const imported = makeZtxtPng("ccv3", oldJson);
  const rewritten = writeCardChunk(imported, newJson);
  expect(await readCardChunk(rewritten, "ccv3")).toBe(newJson);
  // …and the stale chunk is GONE, not merely outvoted.
  expect(walk(rewritten).filter((c) => c.type === "zTXt").length).toBe(0);
  expect(walk(rewritten).filter((c) => c.type === "tEXt" && c.keyword === "ccv3").length).toBe(1);
});

test("a non-card zTXt chunk SURVIVES the write (only card keywords are stale)", async () => {
  const kept = writeCardChunk(spliceBefore(makeBasePng(), makeZtxtPng("Comment", "hello")), v3Json("X"));
  expect(walk(kept).filter((c) => c.type === "zTXt").length).toBe(1);
  expect(await readCardChunk(kept, "ccv3")).toBe(v3Json("X"));
});

// ── the reader's two hardening gaps (#1360 item 2) ───────────────────────────────────────────────────

/** A PNG whose tEXt card chunk carries a WRONG CRC — the shape a corrupt download/edit produces. */
function makeCorruptCrcPng(keyword: string, json: string): Uint8Array {
  const body = Uint8Array.from([...Buffer.from(`${keyword}\0`, "latin1"), ...Buffer.from(Buffer.from(json, "utf8").toString("base64"), "latin1")]);
  const chunk = chunkBytes(TEXT_TYPE_BYTES, body);
  // Corrupt the stored CRC's last byte (255 minus it is always a different value in 0..255).
  chunk[chunk.length - 1] = 0xff - (chunk.at(-1) ?? 0);
  return Uint8Array.from([...PNG_SIG, ...chunk, ...chunkBytes(IEND_TYPE_BYTES, new Uint8Array())]);
}

test("a card chunk whose CRC does not check out reads as ABSENT, not as authentic", async () => {
  // The reader used to ignore CRCs entirely, so corrupt metadata was handed back as if it were real.
  expect(await readCardChunk(makeCorruptCrcPng("ccv3", v3Json("X")), "ccv3")).toBeNull();
});

test("a corrupt card chunk does not shadow a LATER intact one (fail-soft, not fail-stop)", async () => {
  const json = v3Json("Good");
  const corrupt = makeCorruptCrcPng("ccv3", v3Json("Bad"));
  const good = writeCardChunk(makeBasePng(), json);
  // corrupt's chunk (past the signature, before its IEND) spliced ahead of the intact card chunks.
  const decoy = corrupt.subarray(PNG_SIG.length, corrupt.length - 12);
  const spliced = Uint8Array.from([...good.subarray(0, PNG_SIG.length), ...decoy, ...good.subarray(PNG_SIG.length)]);
  expect(await readCardChunk(spliced, "ccv3")).toBe(json);
});

test("a card chunk appended PAST IEND is not read — IEND ends the image", async () => {
  const trailing = writeCardChunk(makeBasePng(), v3Json("Hidden"));
  // Everything after the base PNG's own IEND: the two card chunks + a second IEND, appended whole.
  const base = makeBasePng();
  const smuggled = Uint8Array.from([...base, ...trailing.subarray(PNG_SIG.length)]);
  expect(await readCardChunk(smuggled, "ccv3")).toBeNull();
});

test("post-IEND bytes are PRESERVED AFTER IEND on rewrite, never relocated into the image", () => {
  const tail = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
  const withTail = Uint8Array.from([...makeBasePng(), ...tail]);
  const written = writeCardChunk(withTail, v3Json("X"));
  // The tail is still the last bytes of the file (it used to be spliced in BEFORE IEND, which takes
  // bytes a decoder ignores and folds them into the image stream).
  expect([...written.subarray(written.length - tail.length)]).toEqual([...tail]);
  const types = walk(written).map((c) => c.type);
  expect(types.at(-1)).toBe("IEND");
});

test("writeCardChunk throws on a non-PNG and on a PNG with no IEND", () => {
  expect(() => writeCardChunk(Uint8Array.from([1, 2, 3]), "{}")).toThrow("not a PNG");
  const noIend = Uint8Array.from([...PNG_SIG, 0, 0, 0, 1, ...TEXT_TYPE_BYTES, 0x41, 0, 0, 0, 0]);
  expect(() => writeCardChunk(noIend, "{}")).toThrow("IEND");
});

test("stripCardChunks returns the image without its card chunks — byte-identical to the base it was written on", () => {
  const base = makeBasePng();
  const written = writeCardChunk(base, v3Json("Aria"));
  expect([...stripCardChunks(written)]).toEqual([...base]);
  // Two card texts on one picture strip to one image.
  expect([...stripCardChunks(writeCardChunk(base, v3Json("Bram")))]).toEqual([...stripCardChunks(written)]);
  // Not a PNG, or a PNG with no IEND: the bytes come back as they are.
  const notPng = Uint8Array.from([1, 2, 3]);
  expect(stripCardChunks(notPng)).toBe(notPng);
  const noIend = Uint8Array.from([...PNG_SIG, 0, 0, 0, 1, ...TEXT_TYPE_BYTES, 0x41, 0, 0, 0, 0]);
  expect(stripCardChunks(noIend)).toBe(noIend);
});
