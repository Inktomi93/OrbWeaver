// The PERMANENT PIN for the client boot-chunk ratchet (#460) — the fixture that reproduced the
// undefended-regression class lands as a committed test, not a one-time probe receipt.
//
// WHAT IT DEFENDS: #433 (−20.4%) and #448 (−19.0%) cut the entry chunk 1,146,760 → 740,339 B and nothing
// on the verify ladder could see a re-payment; `quality:boot-chunk` now can. This suite drives
// `measureBootChunk` over PLANTED assets dirs so all four arms are pinned without paying a vite build per
// assertion — including the two that decide whether the fence can LIE:
//   • zero entry chunks and TWO entry chunks must both come back `bytes: null` (unmeasurable → the stage
//     exits 2). A blind "0 bytes, under ceiling ✓" is exactly the fence that silently stops fencing when
//     vite's output naming or chunking strategy moves (#409 zero-hygiene).
//   • a route chunk (`chat-<hash>.js`) alongside the entry chunk must NOT be counted — the pattern is
//     anchored, so a lazily-split route can never masquerade as the boot chunk.
// The over/under arms are the ratchet itself, driven against the REAL committed ceiling so that raising
// `BOOT_CHUNK_CEILING_BYTES` without re-doing its calibration arithmetic still leaves these honest.
import { BOOT_CHUNK_CEILING_BYTES, measureBootChunk } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ASSETS_REL = "packages/client/dist/assets";

/** A planted `dist/assets` tree: filename → byte count (the content is filler of exactly that length). */
function assets(sizes: Readonly<Record<string, number>>): Record<string, string> {
  return Object.fromEntries(Object.entries(sizes).map(([name, bytes]) => [`${ASSETS_REL}/${name}`, "x".repeat(bytes)]));
}

test("a single entry chunk UNDER the ceiling measures clean, with the real ceiling reported", async ({ plantedTree }) => {
  const root = await plantedTree(assets({ "index-CMvWBNPJ.js": BOOT_CHUNK_CEILING_BYTES - 1 }));
  const verdict = measureBootChunk(root);
  expect(verdict.bytes).toBe(BOOT_CHUNK_CEILING_BYTES - 1);
  expect(verdict.ceilingBytes).toBe(BOOT_CHUNK_CEILING_BYTES);
  expect(verdict.candidates).toEqual(["index-CMvWBNPJ.js"]);
});

test("a single entry chunk OVER the ceiling measures over — the regression the ratchet exists to catch", async ({ plantedTree }) => {
  const root = await plantedTree(assets({ "index-CMvWBNPJ.js": BOOT_CHUNK_CEILING_BYTES + 1 }));
  const verdict = measureBootChunk(root);
  // The stage's judgement is `bytes > ceilingBytes`; pin the measurement that feeds it, not a re-derivation.
  expect(verdict.bytes).toBe(BOOT_CHUNK_CEILING_BYTES + 1);
  expect(verdict.bytes === null ? false : verdict.bytes > verdict.ceilingBytes).toBe(true);
});

test("NO entry chunk is UNMEASURABLE (null), never a clean zero — the blind-pass class", async ({ plantedTree }) => {
  const root = await plantedTree(assets({ "chat-BYOwaDjH.js": 1000, "markdown-BYOwaDjH.js": 1000 }));
  const verdict = measureBootChunk(root);
  expect(verdict.candidates).toEqual([]);
  expect(verdict.bytes).toBeNull();
});

test("an ABSENT dist dir is UNMEASURABLE (null) — an unbuilt tree never reads as under budget", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/client/package.json": "{}" });
  const verdict = measureBootChunk(root);
  expect(verdict.candidates).toEqual([]);
  expect(verdict.bytes).toBeNull();
});

test("TWO entry chunks are UNMEASURABLE (null) — a chunking-strategy change must red, not pick one", async ({ plantedTree }) => {
  const root = await plantedTree(assets({ "index-AAAAAAAA.js": 10, "index-BBBBBBBB.js": 20 }));
  const verdict = measureBootChunk(root);
  expect(verdict.candidates).toEqual(["index-AAAAAAAA.js", "index-BBBBBBBB.js"]);
  expect(verdict.bytes).toBeNull();
});

test("a lazily-split route chunk beside the entry chunk is NOT counted (the pattern is anchored)", async ({ plantedTree }) => {
  const root = await plantedTree(
    assets({ "chat-BYOwaDjH.js": 500_000, "index-CMvWBNPJ.js": 100, "index-E54xspSH.css": 900_000, "vendor-index-QQ.js": 400_000 }),
  );
  const verdict = measureBootChunk(root);
  expect(verdict.candidates).toEqual(["index-CMvWBNPJ.js"]);
  expect(verdict.bytes).toBe(100);
});
