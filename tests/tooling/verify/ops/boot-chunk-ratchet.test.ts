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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_STYLESHEET_SENTINELS, BOOT_CHUNK_CEILING_BYTES, measureAppStylesheet, measureBootChunk } from "../../../../tooling/src/verify/index.ts";
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

// ── the app stylesheet (#1752, work item 0029) ─────────────────────────────────────────────────────────
// The same build must emit the app's CSS. A `sideEffects` field on `@orb/client` once let the bundler drop
// `main.tsx`'s bare `import "./styles/index.ts"`, production shipped with no stylesheet, and every
// authored-graph check stayed green. These arms drive `measureAppStylesheet` over planted dists whose sheet
// is built from the REAL minified shapes of the 2026-09-23 production build.

/** The sheet `indexHtml` links, and a second emitted sheet for the multi-sheet arms. */
const LINKED = "index-Dy4jlKlf.css";
const STYLESHEET = "index-BnFtQOxB.css";

/** Each sentinel's real minified construct, keyed by the source that authors it. */
const MINIFIED: Readonly<Record<string, string>> = {
  "packages/client/src/features/app-shell/surfaces/shell.css": ".shell-grid{--rail-w:var(--dimension-rail)}",
  "packages/client/src/styles/globals.css": "@keyframes orb-weave-shimmer{0%,to{opacity:.82}50%{opacity:1}}",
  "packages/ui/src/styles/theme.css": ":root{--font-family:var(--font-mono);--color-background:oklch(15.8% .006 60)}",
};

/** A built dist whose html links `LINKED` and whose sheet carries every sentinel except `without`. */
function appDist(without?: string): Record<string, string> {
  const css = Object.entries(MINIFIED)
    .filter(([source]) => source !== without)
    .map(([, rule]) => rule)
    .join("");
  return { ...indexHtml("index-CEXebaPV.js"), [`${ASSETS_REL}/${LINKED}`]: `.flex{display:flex}${css}` };
}

test("a linked stylesheet carrying every front-door sentinel is the clean verdict", async ({ plantedTree }) => {
  const verdict = measureAppStylesheet(await plantedTree(appDist()));
  expect(verdict).toEqual({ stylesheets: [LINKED], missing: [], unmeasurable: null });
});

test("every sentinel has a minified fixture — the planted sheet covers the whole set", () => {
  expect(Object.keys(MINIFIED).sort()).toEqual(APP_STYLESHEET_SENTINELS.map((sentinel) => sentinel.source).sort());
});

test.for(
  APP_STYLESHEET_SENTINELS.map((sentinel) => [sentinel.label, sentinel.source] as const),
)("a stylesheet that lost `%s` is a violation that names it and its source", async ([label, source], { plantedTree }) => {
  const verdict = measureAppStylesheet(await plantedTree(appDist(source)));
  expect(verdict.unmeasurable).toBeNull();
  expect(verdict.missing.map((sentinel) => [sentinel.label, sentinel.source])).toEqual([[label, source]]);
});

test("an html that links NO stylesheet — the #1752 shape — misses every sentinel", async ({ plantedTree }) => {
  const dist = appDist();
  const html = (dist[INDEX_HTML_REL] ?? "").replace(/\n\s*<link rel="stylesheet"[^>]*>/u, "");
  const verdict = measureAppStylesheet(await plantedTree({ ...dist, [INDEX_HTML_REL]: html }));
  expect(verdict.stylesheets).toEqual([]);
  expect(verdict.missing).toEqual(APP_STYLESHEET_SENTINELS);
  expect(verdict.unmeasurable).toBeNull();
});

test("an emitted CSS file the html does not LINK does not count — the sheet must reach the page", async ({ plantedTree }) => {
  const dist = appDist();
  const html = (dist[INDEX_HTML_REL] ?? "").replace(/\n\s*<link rel="stylesheet"[^>]*>/u, "");
  const verdict = measureAppStylesheet(
    await plantedTree({ ...dist, [INDEX_HTML_REL]: html, [`${ASSETS_REL}/${STYLESHEET}`]: Object.values(MINIFIED).join("") }),
  );
  expect(verdict.stylesheets).toEqual([]);
  expect(verdict.missing).toEqual(APP_STYLESHEET_SENTINELS);
});

test("sentinels may be split across several linked sheets — the union is judged", async ({ plantedTree }) => {
  const dist = appDist("packages/ui/src/styles/theme.css");
  const html = (dist[INDEX_HTML_REL] ?? "").replace("</head>", `  <link rel="stylesheet" crossorigin href="/assets/${STYLESHEET}">\n  </head>`);
  const verdict = measureAppStylesheet(
    await plantedTree({ ...dist, [INDEX_HTML_REL]: html, [`${ASSETS_REL}/${STYLESHEET}`]: MINIFIED["packages/ui/src/styles/theme.css"] ?? "" }),
  );
  expect(verdict).toEqual({ stylesheets: [LINKED, STYLESHEET], missing: [], unmeasurable: null });
});

test("a MISSING index.html is UNMEASURABLE for the stylesheet too, never a violation or a pass", async ({ plantedTree }) => {
  const verdict = measureAppStylesheet(await plantedTree({ [`${ASSETS_REL}/${STYLESHEET}`]: Object.values(MINIFIED).join("") }));
  expect(verdict.unmeasurable).toContain(INDEX_HTML_REL);
  expect(verdict.missing).toEqual([]);
});

test("a linked stylesheet ABSENT from disk is UNMEASURABLE — a half-written dist is not judged", async ({ plantedTree }) => {
  const withoutSheet = Object.fromEntries(Object.entries(appDist()).filter(([path]) => path !== `${ASSETS_REL}/${LINKED}`));
  const verdict = measureAppStylesheet(await plantedTree(withoutSheet));
  expect(verdict.unmeasurable).toContain(LINKED);
});

test("a stylesheet link outside /assets/*.css is UNMEASURABLE — it may be the sheet carrying the sentinels", async ({ plantedTree }) => {
  const dist = appDist();
  const html = (dist[INDEX_HTML_REL] ?? "").replace("</head>", `  <link rel="stylesheet" href="/vendor/app.css">\n  </head>`);
  const verdict = measureAppStylesheet(await plantedTree({ ...dist, [INDEX_HTML_REL]: html }));
  expect(verdict.unmeasurable).toContain("/vendor/app.css");
});

test("each sentinel matches the source it names on the real tree — a rename reds here before a push", ({ repoRoot }) => {
  for (const sentinel of APP_STYLESHEET_SENTINELS) {
    expect({ source: sentinel.source, matches: sentinel.pattern.test(readFileSync(join(repoRoot, sentinel.source), "utf8")) }).toEqual({
      source: sentinel.source,
      matches: true,
    });
  }
});
