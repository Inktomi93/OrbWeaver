// The PERMANENT PIN for the client boot-payload ratchet (#460, re-scoped by #591) — the fixtures that
// reproduced both defect classes land as committed tests, not one-time probe receipts.
//
// WHAT IT DEFENDS: #433 (−20.4%) and #448 (−19.0%) cut the entry chunk 1,146,760 → 740,339 B and nothing
// on the verify ladder could see a re-payment; `quality:boot-chunk` now can. This suite drives
// `measureBootChunk` over PLANTED dist trees so every arm is pinned without paying a vite build per
// assertion — including the ones that decide whether the fence can LIE:
//   • THE #591 SHAPE (the headline pin): a chunk SPLIT — entry + a `<link rel="modulepreload">` sibling —
//     must SUM. The old single-file read scored commit 2b87a0d7c as a 36,584 B win while the browser
//     still fetched every byte on the boot path; the same blindness would score pushing 300 KB into a
//     preloaded sibling as a win while boot got no cheaper.
//   • an `/assets/*.js` the html mentions in an unrecognized shape must be UNMEASURABLE, never dropped
//     from the sum — an under-count is the same lie with a smaller number.
//   • zero entry chunks, TWO entry chunks, a missing index.html and a referenced-but-absent asset must
//     all come back `bytes: null` (unmeasurable → the stage exits 2). A blind "0 bytes, under ceiling ✓"
//     is exactly the fence that silently stops fencing when vite's output moves (#409 zero-hygiene).
//   • a route chunk (`chat-<hash>.js`) sitting in the dir but referenced by nothing must NOT be counted.
// The over/under arms are the ratchet itself, driven against the REAL committed ceiling so that raising
// `BOOT_CHUNK_CEILING_BYTES` without re-doing its calibration arithmetic still leaves these honest.
import { BOOT_CHUNK_CEILING_BYTES, measureBootChunk } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ASSETS_REL = "packages/client/dist/assets";
const INDEX_HTML_REL = "packages/client/dist/index.html";

/** A planted `dist/assets` tree: filename → byte count (the content is filler of exactly that length). */
function assets(sizes: Readonly<Record<string, number>>): Record<string, string> {
  return Object.fromEntries(Object.entries(sizes).map(([name, bytes]) => [`${ASSETS_REL}/${name}`, "x".repeat(bytes)]));
}

/** vite's emitted SPA index, verbatim in shape: a module entry script plus zero or more modulepreloaded
 *  siblings, and the stylesheet link that must never be counted as boot JS. */
function indexHtml(entry: string, preloads: readonly string[] = []): Record<string, string> {
  const tags = [
    `    <script type="module" crossorigin src="/assets/${entry}"></script>`,
    ...preloads.map((name) => `    <link rel="modulepreload" crossorigin href="/assets/${name}">`),
    `    <link rel="stylesheet" crossorigin href="/assets/index-Dy4jlKlf.css">`,
  ].join("\n");
  return { [INDEX_HTML_REL]: `<!doctype html>\n<html lang="en">\n  <head>\n${tags}\n  </head>\n  <body><div id="root"></div></body>\n</html>\n` };
}

test("a modulepreloaded sibling is SUMMED into the boot payload — the #591 shape", async ({ plantedTree }) => {
  // Commit 2b87a0d7c's emitted dist, to the byte: the entry chunk shed 36,584 B into a jsx-runtime chunk
  // that index.html modulepreloads. Measuring the entry file alone reads a 36,584 B win; the browser
  // fetches both.
  const root = await plantedTree({
    ...assets({ "index-BsalMtFR.js": 706_346, "jsx-runtime-DUeIs9Gz.js": 36_584 }),
    ...indexHtml("index-BsalMtFR.js", ["jsx-runtime-DUeIs9Gz.js"]),
  });
  const verdict = measureBootChunk(root);
  expect(verdict.bytes).toBe(742_930);
  expect(verdict.bootFiles).toEqual([
    { name: "index-BsalMtFR.js", bytes: 706_346 },
    { name: "jsx-runtime-DUeIs9Gz.js", bytes: 36_584 },
  ]);
  expect(verdict.unmeasurable).toBeNull();
});

test("splitting bytes into a preloaded sibling is not a win — the symmetric half of the lie", async ({ plantedTree }) => {
  // Same total, one file vs two: the ratchet must be INDIFFERENT to how vite chunks the boot path.
  const whole = await plantedTree({ ...assets({ "index-AAAAAAAA.js": 300_000 }), ...indexHtml("index-AAAAAAAA.js") });
  const split = await plantedTree({
    ...assets({ "index-AAAAAAAA.js": 100_000, "vendor-BBBBBBBB.js": 200_000 }),
    ...indexHtml("index-AAAAAAAA.js", ["vendor-BBBBBBBB.js"]),
  });
  expect(measureBootChunk(split).bytes).toBe(measureBootChunk(whole).bytes);
});

test("a boot payload UNDER the ceiling measures clean, with the real ceiling reported", async ({ plantedTree }) => {
  const root = await plantedTree({
    ...assets({ "index-CMvWBNPJ.js": BOOT_CHUNK_CEILING_BYTES - 1001, "jsx-runtime-DUeIs9Gz.js": 1000 }),
    ...indexHtml("index-CMvWBNPJ.js", ["jsx-runtime-DUeIs9Gz.js"]),
  });
  const verdict = measureBootChunk(root);
  expect(verdict.bytes).toBe(BOOT_CHUNK_CEILING_BYTES - 1);
  expect(verdict.ceilingBytes).toBe(BOOT_CHUNK_CEILING_BYTES);
  expect(verdict.candidates).toEqual(["index-CMvWBNPJ.js"]);
});

test("a boot payload OVER the ceiling measures over — the regression the ratchet exists to catch", async ({ plantedTree }) => {
  const root = await plantedTree({
    ...assets({ "index-CMvWBNPJ.js": BOOT_CHUNK_CEILING_BYTES - 999, "jsx-runtime-DUeIs9Gz.js": 1000 }),
    ...indexHtml("index-CMvWBNPJ.js", ["jsx-runtime-DUeIs9Gz.js"]),
  });
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

test("a MISSING index.html is UNMEASURABLE — the boot set is whatever the emitted html declares", async ({ plantedTree }) => {
  const root = await plantedTree(assets({ "index-CMvWBNPJ.js": 100 }));
  const verdict = measureBootChunk(root);
  expect(verdict.bytes).toBeNull();
  expect(verdict.unmeasurable).toContain("packages/client/dist/index.html");
});

test("an html whose module script is NOT the entry chunk is UNMEASURABLE — the naming-change arm", async ({ plantedTree }) => {
  const root = await plantedTree({
    ...assets({ "index-CMvWBNPJ.js": 100, "main-QQQQQQQQ.js": 100 }),
    ...indexHtml("main-QQQQQQQQ.js"),
  });
  const verdict = measureBootChunk(root);
  expect(verdict.bytes).toBeNull();
  expect(verdict.unmeasurable).toContain("main-QQQQQQQQ.js");
});

test("a referenced asset ABSENT from disk is UNMEASURABLE — a half-written dist never reads as small", async ({ plantedTree }) => {
  const root = await plantedTree({ ...assets({ "index-CMvWBNPJ.js": 100 }), ...indexHtml("index-CMvWBNPJ.js", ["jsx-runtime-GONE.js"]) });
  const verdict = measureBootChunk(root);
  expect(verdict.bytes).toBeNull();
  expect(verdict.unmeasurable).toContain("jsx-runtime-GONE.js");
});

test("an UNRECOGNIZED asset reference is UNMEASURABLE, never silently dropped from the sum", async ({ plantedTree }) => {
  // A future vite could emit its boot refs some other way (an import map, a prefetch rel, an inline
  // bootstrap). Under-counting reads as a win, which is the whole #591 defect — so refuse instead.
  const html = indexHtml("index-CMvWBNPJ.js");
  const root = await plantedTree({
    ...assets({ "index-CMvWBNPJ.js": 100, "vendor-ZZZZZZZZ.js": 400_000 }),
    [INDEX_HTML_REL]: `${html[INDEX_HTML_REL] ?? ""}<script type="importmap">{"imports":{"v":"/assets/vendor-ZZZZZZZZ.js"}}</script>\n`,
  });
  const verdict = measureBootChunk(root);
  expect(verdict.bytes).toBeNull();
  expect(verdict.unmeasurable).toContain("vendor-ZZZZZZZZ.js");
});

test("a boot ref outside /assets/*.js is UNMEASURABLE — a skipped boot ref is a byte the sum misses", async ({ plantedTree }) => {
  const html = indexHtml("index-CMvWBNPJ.js");
  const root = await plantedTree({
    ...assets({ "index-CMvWBNPJ.js": 100 }),
    [INDEX_HTML_REL]: (html[INDEX_HTML_REL] ?? "").replace("</head>", `  <link rel="modulepreload" crossorigin href="/vendor/react.js">\n  </head>`),
  });
  const verdict = measureBootChunk(root);
  expect(verdict.bytes).toBeNull();
  expect(verdict.unmeasurable).toContain("/vendor/react.js");
});

test("a lazily-split route chunk the html never references is NOT counted", async ({ plantedTree }) => {
  const root = await plantedTree({
    ...assets({ "chat-BYOwaDjH.js": 500_000, "index-CMvWBNPJ.js": 100, "index-E54xspSH.css": 900_000, "vendor-index-QQ.js": 400_000 }),
    ...indexHtml("index-CMvWBNPJ.js"),
  });
  const verdict = measureBootChunk(root);
  expect(verdict.candidates).toEqual(["index-CMvWBNPJ.js"]);
  expect(verdict.bootFiles).toEqual([{ name: "index-CMvWBNPJ.js", bytes: 100 }]);
  expect(verdict.bytes).toBe(100);
});
