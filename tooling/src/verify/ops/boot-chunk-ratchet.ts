// The client BOOT-PAYLOAD ratchet — `@orb/client` is built for production and the JS the browser fetches
// to boot must stay under a committed byte ceiling. That payload is the entry chunk
// (`packages/client/dist/assets/index-<hash>.js`) PLUS every `dist/assets/*.js` the EMITTED
// `dist/index.html` references, because vite writes each of the entry's shared chunks as
// `<link rel="modulepreload">` and the browser fetches those on the same boot path.
//
// SCOPED TO THE BOOT SET, NOT THE ENTRY FILE (issue #591 — the instrument was caught lying). Measuring
// only `index-<hash>.js` makes a CHUNK SPLIT read as a win: commit 2b87a0d7c moved 36,584 B of the entry
// chunk into `jsx-runtime-<hash>.js`, which index.html modulepreloads — the old single-file read would
// have reported a −36,491 B improvement while the real boot payload moved +93 B. The lie is symmetric:
// pushing 300 KB into a preloaded sibling would have read as a large win while boot got no cheaper. Any
// `/assets/*.js` the html mentions in a shape the boot-ref parser does not recognize is UNMEASURABLE
// rather than silently dropped from the sum — an under-count is the same class of lie.
//
// WHY IT EXISTS (issue #460): two lanes cut the entry chunk 1,146,760 → 739,736 B — #433 (−20.4%, the
// barrel-import wave) and #448 (−19.0%, the contracts subpath split) — and NOTHING defended either win.
// The regression mechanism is one line: a new barrel import inside `main.tsx`'s STATIC graph silently
// re-pays the whole cost, and the only thing standing between the tree and that is whoever happens to
// read vite's build summary. A byte ceiling catches every mechanism (a barrel, a fat dep, a lost
// `import type`, a route that stopped being lazy) rather than enumerating the ones we have seen.
//
// WHY THE PUSH TIER, NOT `pnpm check`: this stage runs a real vite production build. Measured on this
// box 2026-08-22: 15.45s wall for a warm tree — cheap by build standards, but `pnpm check` is the
// STRUCTURAL-fast commit bar (UNIFIED-VERIFICATION-DESIGN §3.2: "no behavioral suite"), and a bundler
// invocation is neither structural nor fast-by-that-standard. `push` is the behavioural bar where the
// vitest projects, the CT suite and e2e-smoke already live, and a boot-chunk regression is exactly the
// class you want caught before a push rather than after. Re-tier it only with a fresh timing receipt.
//
// UNMEASURABLE IS A TOOL ERROR, NEVER A PASS (#409 zero-hygiene). Zero matching entry chunks or more than
// one, an unreadable emitted html, an html whose module script is not the entry chunk, a referenced asset
// that is absent from disk, or an unrecognized asset reference all mean the instrument could not measure —
// a vite `output.entryFileNames` change, a chunking change, a missing build — and it exits 2 (the run is
// NOT a verdict). A "0 bytes, under ceiling ✓" would have been a fence that silently stopped fencing.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { budget } from "@orb/tooling/_shared/load-budget";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import type { BootChunkFile, BootChunkVerdict } from "../contract/scoped.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:boot-chunk");

const DIST_REL = "packages/client/dist";
const ASSETS_REL = `${DIST_REL}/assets`;
/** vite's emitted SPA index — the ONE authority on what the browser fetches to boot. */
const INDEX_HTML_REL = `${DIST_REL}/index.html`;
/** vite's default `entryFileNames` for the client entry: `index-<8-char base64url hash>.js`. Anchored —
 *  a lazily-imported route chunk (`chat-BYOwaDjH.js`) must never be mistaken for the entry chunk. */
const ENTRY_CHUNK_RE = /^index-[A-Za-z0-9_-]+\.js$/u;
/** Every `<script>` / `<link>` tag, with its attribute text captured for the predicates below. */
const TAG_RE = /<(script|link)\b([^>]*)>/giu;
const TYPE_MODULE_RE = /\btype\s*=\s*["']module["']/iu;
const REL_MODULEPRELOAD_RE = /\brel\s*=\s*["']modulepreload["']/iu;
const SRC_ATTR_RE = /\bsrc\s*=\s*["']([^"']*)["']/iu;
const HREF_ATTR_RE = /\bhref\s*=\s*["']([^"']*)["']/iu;
/** The build's `base: "/"` — every emitted boot ref is root-absolute `/assets/<name>.js`. */
const ASSET_REF_PREFIX = "/assets/";
const ASSET_JS_REF_RE = /^\/assets\/([A-Za-z0-9._-]+\.js)$/u;
/** EVERY built-js mention anywhere in the html — the under-count tripwire (see the header). */
const ASSET_JS_MENTION_RE = /\/assets\/[A-Za-z0-9._-]+\.js/gu;
/** A production vite build of the client; the timeout is a ceiling on a WEDGE, not a budget (see the
 *  15.45s measurement above) — generous enough to survive a cold tree under multi-lane load. */
// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const BUILD_TIMEOUT_MS_BASE = 300_000;
const BUILD_TIMEOUT_MS = budget(BUILD_TIMEOUT_MS_BASE);

// ── the ceiling ───────────────────────────────────────────────────────────────────────────────────────
// CALIBRATION (the discipline: measured value, headroom,
// re-calibrate conditions — never a bare number).
//
// MEASURED 2026-08-22 on the #460 lane tree (branch base 70e7c398c): dist/assets/index-CMvWBNPJ.js =
// 740,339 B — but that was the ENTRY FILE ALONE, which #591 established is not the boot payload.
//
// RE-MEASURED 2026-08-23 on this lane's tree (branch base 1b5fe507a, warm `pnpm --filter @orb/client
// build`) against the BOOT SET the emitted index.html declares:
//   index-BsalMtFR.js       706,346 B  (the module entry script)
//   jsx-runtime-DUeIs9Gz.js  36,584 B  (<link rel="modulepreload"> — fetched on the boot path)
//   ────────────────────────────────
//   boot payload            742,930 B
// That is the same post-#433+#448 plateau as the 740,339 B figure (the pre-#433 entry chunk was
// 1,146,760 B); the split into a preloaded sibling arrived with 2b87a0d7c and moved the real total by
// +93 B, which is ordinary tree movement, not a regression.
//
// That 780,000 B ceiling expired before #995: the 2026-09-01 pre-fix build measured 819,676 B and the
// emitted html declared a third boot file, `time-Das8Thoo.js` (85,455 B). A sourcemap attribution of
// that shared chunk found the production validation/identity floor — Zod core/classic, UUID/TypeID,
// kit ids/time, `zod-jitless.ts`, Query timeout management, and Appearance boot-hint/readiness code.
// Owner ruling: that synchronous production validation graph stays foundational; do not make Zod lazy
// or defer contract loading merely to satisfy a stale number.
//
// RE-CALIBRATED 2026-09-01 after #995 restored the production-readiness / dev-instrumentation boundary:
//   index-Bw7uAXfc.js       696,149 B  (the module entry script)
//   jsx-runtime-DUeIs9Gz.js  36,584 B  (<link rel="modulepreload"> — fetched on the boot path)
//   time-Das8Thoo.js         85,455 B  (<link rel="modulepreload"> — production validation/identity)
//   ────────────────────────────────
//   boot payload            818,188 B
// The pre-split build was 819,676 B, so the clean boundary removed 1,488 B. The emitted production JS
// retained `data-app-ready` but no Appearance/CSS-merge/animation debug registry strings; the residual
// is the reviewed production graph above, not the dev graph moved into a preload.
//
// CEILING WAS 859,000 B (superseded 2026-09-05, below). Arithmetic (same convention): 818,188 × 1.05 = 859,097.4, rounded DOWN to the
// flat 859,000 → 40,812 B of headroom = 4.99% over the measured value. Sized like the mutation gate's
// `break`: a ceiling AT the measured value fires on ordinary churn (a token, a copy string, a new icon),
// while ~5% is far below the cost of the class this exists to catch — re-adding ONE prose barrel to the
// static graph is a six-figure-byte event (#433's own win was 234,000 B), so the fence still bites on the
// first real regression and never on noise. The sensitivity convention is unchanged; the baseline now
// describes the production boot set the browser actually fetches.
//
// RE-CALIBRATED 2026-09-05 (#1752) — the OWNER DROPPED `@orb/client`'s `sideEffects` allowlist, and this
// number is the accepted price of that ruling, not a regression to hunt. The allowlist bought the #433/
// #448/d99b6586f barrel shaking, but Rolldown applies the nearest package.json's `sideEffects` to the
// app's OWN files (vitejs/vite#22620), so every import-for-effect module had to be enumerated by hand —
// and the Aug-31 CSS front door (`packages/client/src/styles/index.ts`) never was. Its bare import was
// shaken out and the production bundle shipped with NO app stylesheet for five days; nothing static saw
// it. Owner ruling 2026-09-05: "drop it and just raise the boot limit" — an app is not a library, and an
// enumeration duty no gate enforces is a silent-failure machine.
//   index-Do_rgPCq.js     2,526,998 B  (the module entry script — barrels no longer shake)
//   ui-BzArPkcz.js          416,327 B  (<link rel="modulepreload">)
//   jsx-runtime-DUeIs9Gz.js  36,584 B  (<link rel="modulepreload">)
//   class-merge-BLVu9lJq.js  30,652 B  (<link rel="modulepreload">)
//   createLucideIcon-…js      1,385 B  (<link rel="modulepreload">)
//   focus-ring-D9Uf2YJG.js    1,039 B  (<link rel="modulepreload">)
//   ────────────────────────────────
//   boot payload          3,012,985 B  (was 818,188 B)
// CEILING = 3,163,000 B. Same arithmetic as every row above: 3,012,985 × 1.05 = 3,163,634.25, rounded
// DOWN to the flat 3,163,000 → 150,015 B of headroom = 4.98%. The fence's PURPOSE is unchanged and it
// still bites: a six-figure-byte barrel re-entry on top of this baseline is caught exactly as before.
//
// RE-CALIBRATE when: a deliberate, reviewed boot-graph addition lands (raise it, with its own measured
// receipt and this same arithmetic); or a win like #433/#448 lands and the ceiling should ratchet DOWN
// to defend it. A chunking-strategy change no longer needs a re-calibration to stay HONEST — the sum
// follows the emitted html — though it will still move the number. This is deliberately ONE-SIDED — a
// shrink is never RED, it is reported as headroom in the stage output so a large drop is visible and
// can be ratcheted by hand.
export const BOOT_CHUNK_CEILING_BYTES = 3_163_000;

/** The `/assets/<name>.js` an emitted boot ref points at, or undefined for anything else (a CSS href, a
 *  favicon, an external URL) — the parser is anchored, never "whatever happens to be there". */
function assetJsName(ref: string | undefined): string | undefined {
  return ref === undefined ? undefined : (ASSET_JS_REF_RE.exec(ref)?.[1] ?? undefined);
}

/** The boot refs the emitted html declares: module `<script src>` (the entry) and `modulepreload` hrefs
 *  (the entry's shared chunks, fetched on the same boot path). A boot ref that does NOT resolve to a
 *  `/assets/<name>.js` lands in `foreign` rather than being skipped — a skipped boot ref is a byte the
 *  browser fetches and the sum misses, which is the #591 lie in miniature. */
function readBootRefs(html: string): {
  readonly entryScripts: readonly string[];
  readonly preloads: readonly string[];
  readonly foreign: readonly string[];
} {
  const entryScripts: string[] = [];
  const preloads: string[] = [];
  const foreign: string[] = [];
  for (const [, tag = "", attrs = ""] of html.matchAll(TAG_RE)) {
    const isScript = tag.toLowerCase() === "script";
    const isBootRef = isScript ? TYPE_MODULE_RE.test(attrs) : REL_MODULEPRELOAD_RE.test(attrs);
    if (!isBootRef) {
      continue;
    }
    const ref = (isScript ? SRC_ATTR_RE : HREF_ATTR_RE).exec(attrs)?.[1];
    const name = assetJsName(ref);
    if (name === undefined) {
      // An inline `<script type="module">` (no src) declares boot code with no file to weigh; a ref
      // outside `/assets/*.js` is a shape this parser cannot size. Both must refuse.
      foreign.push(ref ?? "<inline module script>");
      continue;
    }
    (isScript ? entryScripts : preloads).push(name);
  }
  return { entryScripts, preloads, foreign };
}

/** Read the built dist and judge it. SEPARATE from the build on purpose: this is the pure-ish seam
 *  `tests/tooling/verify/ops/boot-chunk-ratchet.test.ts` drives over planted fixture trees, so the
 *  over/under/sum/no-chunk/two-chunk arms are pinned permanently without paying a vite build per
 *  assertion. */
export function measureBootChunk(root: string, ceilingBytes: number = BOOT_CHUNK_CEILING_BYTES): BootChunkVerdict {
  const assetsDir = join(root, ASSETS_REL);
  let candidates: string[];
  // @orb-waive caught-failure-ownership(catch): documented on the next line — an unreadable/absent dir is the same UNMEASURABLE class as zero matches, and `entry === undefined` below routes it to the `unmeasurable()` verdict, never a pass. Ends if that unmeasurable() routing is removed.
  try {
    candidates = readdirSync(assetsDir)
      .filter((name) => ENTRY_CHUNK_RE.test(name))
      .sort();
  } catch {
    // An unreadable/absent dir is the same UNMEASURABLE class as zero matches — never a pass.
    candidates = [];
  }
  const unmeasurable = (why: string): BootChunkVerdict => ({ assetsDir: ASSETS_REL, candidates, bootFiles: [], bytes: null, ceilingBytes, unmeasurable: why });

  const entry = candidates.length === 1 ? candidates[0] : undefined;
  if (entry === undefined) {
    return unmeasurable(`${candidates.length} file(s) in ${ASSETS_REL} match /${ENTRY_CHUNK_RE.source}/, expected exactly 1`);
  }

  let html: string;
  // @orb-waive caught-failure-ownership(catch): captured and routed to the `unmeasurable()` verdict on the next line, never a pass. Ends if that unmeasurable() routing is removed.
  try {
    html = readFileSync(join(root, INDEX_HTML_REL), "utf8");
  } catch {
    return unmeasurable(`${INDEX_HTML_REL} is unreadable — the boot set is whatever the emitted html declares, so it cannot be derived without it`);
  }

  const { entryScripts, preloads, foreign } = readBootRefs(html);
  if (foreign.length > 0) {
    return unmeasurable(`${INDEX_HTML_REL} declares boot ref(s) [${foreign.join(", ")}] this parser cannot size — they are not /assets/<name>.js`);
  }
  if (entryScripts.length !== 1 || entryScripts[0] !== entry) {
    return unmeasurable(`${INDEX_HTML_REL} declares module script(s) [${entryScripts.join(", ")}], expected exactly the entry chunk ${entry}`);
  }

  const names = [...new Set([entry, ...preloads])].sort();
  // An `/assets/*.js` the html mentions in a shape `readBootRefs` does not recognize would silently drop
  // OUT of the sum — the same under-count lie #591 was opened for. Refuse instead.
  const unaccounted = [...new Set(Array.from(html.matchAll(ASSET_JS_MENTION_RE), ([ref]) => ref.slice(ASSET_REF_PREFIX.length)))].filter(
    (name) => !names.includes(name),
  );
  if (unaccounted.length > 0) {
    return unmeasurable(`${INDEX_HTML_REL} references ${unaccounted.join(", ")} in a shape this parser does not recognize as a boot ref`);
  }

  const bootFiles: BootChunkFile[] = [];
  for (const name of names) {
    let bytes: number;
    // @orb-waive caught-failure-ownership(catch): captured and routed to the `unmeasurable()` verdict on the next line, never a pass. Ends if that unmeasurable() routing is removed.
    try {
      bytes = statSync(join(assetsDir, name)).size;
    } catch {
      return unmeasurable(`${INDEX_HTML_REL} references ${ASSET_REF_PREFIX}${name}, which is absent from ${ASSETS_REL}`);
    }
    bootFiles.push({ name, bytes });
  }

  return {
    assetsDir: ASSETS_REL,
    candidates,
    bootFiles,
    bytes: bootFiles.reduce((sum, file) => sum + file.bytes, 0),
    ceilingBytes,
    unmeasurable: null,
  };
}

const PERCENT = 100;
const PCT_DIGITS = 2;

function pct(part: number, whole: number): string {
  return `${((part / whole) * PERCENT).toFixed(PCT_DIGITS)}%`;
}

/** Thousands separators, LOCALE-FREE. Deliberately not `toLocaleString`: this is gate output that gets
 *  pasted into commit messages, issues and calibration comments, so it must read identically on every
 *  machine — and the `no-raw-intl-time` gate (rightly) treats a bare `.toLocale*String()` as the Intl
 *  back door. `Intl.NumberFormat` would satisfy the letter and still make the output host-dependent. */
const THOUSANDS_RE = /\B(?=(?:\d{3})+(?!\d))/gu;

function grouped(n: number): string {
  return String(n).replace(THOUSANDS_RE, ",");
}

function reportUnmeasurable(verdict: BootChunkVerdict): number {
  process.stdout.write(`boot-chunk-ratchet — TOOL ERROR: ${verdict.unmeasurable ?? "the boot set could not be derived"}\n`);
  if (verdict.candidates.length > 0) {
    process.stdout.write(`      entry-chunk candidates on disk: ${verdict.candidates.join(", ")}\n`);
  }
  process.stdout.write(
    "  The ratchet could not MEASURE, so this run is not a verdict (exit 2). Either the build produced no\n" +
      "  entry chunk, or vite's output naming / chunking / html-emission changed — fix the patterns in\n" +
      "  tooling/src/verify/ops/boot-chunk-ratchet.ts, never widen them to whatever happens to be there.\n",
  );
  return EXIT.toolError;
}

/** The `boot-chunk` verb: build the client, then judge the emitted BOOT SET against the ceiling. */
export async function runBootChunkRatchet(root: string): Promise<number> {
  const build = await spawnNiced("pnpm", ["--filter", "@orb/client", "build"], { cwd: root, timeoutMs: BUILD_TIMEOUT_MS });
  if (build.code !== 0) {
    // A failed/killed build is a BROKEN CHECKER, never a size verdict (exit-contract §3.3).
    const how = build.timedOut ? `timed out after ${BUILD_TIMEOUT_MS}ms` : `exited ${build.code === null ? "on a signal" : String(build.code)}`;
    process.stdout.write(`boot-chunk-ratchet — TOOL ERROR: \`pnpm --filter @orb/client build\` ${how}\n`);
    process.stdout.write(`${build.stderr.trimEnd()}\n`);
    return EXIT.toolError;
  }

  const verdict = measureBootChunk(root);
  if (verdict.bytes === null) {
    return reportUnmeasurable(verdict);
  }

  const { bytes, ceilingBytes } = verdict;
  process.stdout.write(`boot-chunk-ratchet — boot payload = ${grouped(bytes)} B (ceiling ${grouped(ceilingBytes)} B)\n`);
  // Name the parts: the sum is over the entry chunk PLUS every modulepreloaded sibling, and a reader
  // chasing a regression needs to see WHICH file moved, not just that the total did.
  for (const file of verdict.bootFiles) {
    process.stdout.write(`      ${file.name} = ${grouped(file.bytes)} B\n`);
  }
  if (bytes <= ceilingBytes) {
    process.stdout.write(`  ✓ ${grouped(ceilingBytes - bytes)} B of headroom (${pct(ceilingBytes - bytes, ceilingBytes)} of the ceiling)\n`);
    return EXIT.clean;
  }
  process.stdout.write(
    `  ✗ OVER by ${grouped(bytes - ceilingBytes)} B (${pct(bytes - ceilingBytes, ceilingBytes)})\n\n` +
      "  FIX: something joined main.tsx's STATIC import graph — the class #433/#448 cut out. Find it with\n" +
      "  `pnpm ast reaches` from the entry, or read the build summary's chunk table, and make it lazy /\n" +
      "  import the subpath instead of the barrel. Splitting it into a modulepreloaded sibling is NOT a\n" +
      "  fix — that is the whole boot set and it is what this number sums (#591). Only RAISE the ceiling\n" +
      "  for a deliberate, reviewed addition, and re-do the calibration arithmetic in the same commit.\n",
  );
  return EXIT.violations;
}
