// The client BOOT-CHUNK ratchet — `@orb/client` is built for production and the emitted entry chunk
// (`packages/client/dist/assets/index-<hash>.js`) must stay under a committed byte ceiling.
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
// UNMEASURABLE IS A TOOL ERROR, NEVER A PASS (#409 zero-hygiene). Zero matching chunks or more than one
// means the instrument could not measure — a vite `output.entryFileNames` change, a manualChunks split, a
// missing build — and it exits 2 (the run is NOT a verdict). A "0 bytes, under ceiling ✓" would have been
// a fence that silently stopped fencing.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import type { BootChunkVerdict } from "../contract/scoped.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:boot-chunk");

const ASSETS_REL = "packages/client/dist/assets";
/** vite's default `entryFileNames` for the client entry: `index-<8-char base64url hash>.js`. Anchored —
 *  a lazily-imported route chunk (`chat-BYOwaDjH.js`) must never be mistaken for the boot chunk. */
const ENTRY_CHUNK_RE = /^index-[A-Za-z0-9_-]+\.js$/u;
/** A production vite build of the client; the timeout is a ceiling on a WEDGE, not a budget (see the
 *  15.45s measurement above) — generous enough to survive a cold tree under multi-lane load. */
const BUILD_TIMEOUT_MS = 300_000;

// ── the ceiling ───────────────────────────────────────────────────────────────────────────────────────
// CALIBRATION (the `stryker.gate.config.json` `_thresholds_comment` discipline: measured value, headroom,
// re-calibrate conditions — never a bare number).
//
// MEASURED 2026-08-22 on the #460 lane tree (branch base 70e7c398c, warm `pnpm --filter @orb/client
// build`, 15.45s): dist/assets/index-CMvWBNPJ.js = 740,339 B. The #460 issue body cites 739,736 B from
// the #448 landing; the 603 B delta is ordinary tree movement between that landing and this measurement,
// not drift — both numbers are the post-#433+#448 plateau (the pre-#433 chunk was 1,146,760 B).
//
// CEILING = 777,000 B. Arithmetic: 740,339 × 1.05 = 777,355.95, rounded DOWN to the flat 777,000 →
// 36,661 B of headroom = 4.95% over the measured value. Sized like the mutation gate's `break`: a
// ceiling AT the measured value fires on ordinary churn (a token, a copy string, a new icon), while
// ~5% is far below the cost of the class this exists to catch — re-adding ONE prose barrel to the
// static graph is a six-figure-byte event (#433's own win was 234,000 B), so the fence still bites
// on the first real regression and never on noise.
//
// RE-CALIBRATE when: a deliberate, reviewed boot-graph addition lands (raise it, with its own measured
// receipt and this same arithmetic); a chunking-strategy change moves what the entry chunk CONTAINS
// (`vite.config.ts` manualChunks / route lazy-loading); or a win like #433/#448 lands and the ceiling
// should ratchet DOWN to defend it. This is deliberately ONE-SIDED — a shrink is never RED, it is
// reported as headroom in the stage output so a large drop is visible and can be ratcheted by hand.
export const BOOT_CHUNK_CEILING_BYTES = 777_000;

/** Read the built assets dir and judge it. SEPARATE from the build on purpose: this is the pure-ish seam
 *  `tests/tooling/verify/ops/boot-chunk-ratchet.test.ts` drives over planted fixture trees, so the
 *  over/under/no-chunk/two-chunk arms are pinned permanently without paying a vite build per assertion. */
export function measureBootChunk(root: string, ceilingBytes: number = BOOT_CHUNK_CEILING_BYTES): BootChunkVerdict {
  const assetsDir = join(root, ASSETS_REL);
  let candidates: string[];
  try {
    candidates = readdirSync(assetsDir)
      .filter((name) => ENTRY_CHUNK_RE.test(name))
      .sort();
  } catch {
    // An unreadable/absent dir is the same UNMEASURABLE class as zero matches — never a pass.
    candidates = [];
  }
  const sole = candidates.length === 1 ? candidates[0] : undefined;
  return {
    assetsDir: ASSETS_REL,
    candidates,
    bytes: sole === undefined ? null : statSync(join(assetsDir, sole)).size,
    ceilingBytes,
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
  process.stdout.write(
    `boot-chunk-ratchet — TOOL ERROR: ${verdict.candidates.length} entry chunk(s) matching /${ENTRY_CHUNK_RE.source}/ in ${verdict.assetsDir}, expected exactly 1\n`,
  );
  if (verdict.candidates.length > 0) {
    process.stdout.write(`      found: ${verdict.candidates.join(", ")}\n`);
  }
  process.stdout.write(
    "  The ratchet could not MEASURE, so this run is not a verdict (exit 2). Either the build produced no\n" +
      "  entry chunk, or vite's output naming / chunking strategy changed — fix the pattern in\n" +
      "  tooling/src/verify/ops/boot-chunk-ratchet.ts, never widen it to whatever happens to be there.\n",
  );
  return EXIT.toolError;
}

/** The `boot-chunk` verb: build the client, then judge the emitted entry chunk against the ceiling. */
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
  process.stdout.write(`boot-chunk-ratchet — ${verdict.candidates[0]} = ${grouped(bytes)} B (ceiling ${grouped(ceilingBytes)} B)\n`);
  if (bytes <= ceilingBytes) {
    process.stdout.write(`  ✓ ${grouped(ceilingBytes - bytes)} B of headroom (${pct(ceilingBytes - bytes, ceilingBytes)} of the ceiling)\n`);
    return EXIT.clean;
  }
  process.stdout.write(
    `  ✗ OVER by ${grouped(bytes - ceilingBytes)} B (${pct(bytes - ceilingBytes, ceilingBytes)})\n\n` +
      "  FIX: something joined main.tsx's STATIC import graph — the class #433/#448 cut out. Find it with\n" +
      "  `pnpm ast reaches` from the entry, or read the build summary's chunk table, and make it lazy /\n" +
      "  import the subpath instead of the barrel. Only RAISE the ceiling for a deliberate, reviewed\n" +
      "  addition, and re-do the calibration arithmetic in boot-chunk-ratchet.ts when you do.\n",
  );
  return EXIT.violations;
}
