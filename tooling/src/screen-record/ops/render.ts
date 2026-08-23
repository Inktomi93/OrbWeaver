// The ffmpeg render leg: GIF (two-pass palette), per-click 6-tile strips, optional per-step frames.
// FFMPEG DEGRADATION: no ffmpeg -> the webm still lands, these legs SKIP with a reason in the RESULT
// line, exit stays 0 (skip != fail). Playwright's bundled ffmpeg is NOT a fallback (screencast-only
// build, no palette/tile filters). Spawns ride the proc door (nice -19 — encodes are background CPU).
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { print } from "@orb/tooling/_shared/artifacts";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Rendered, RenderJob } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm record");

const MS_PER_S = 1000;
const CLICK_STRIP_PRE_S = 0.05;
const CLICK_STRIP_LEN_S = 0.75;

function runFfmpeg(bin: string, args: string[]): boolean {
  const res = runNicedSync(bin, args);
  if (res.status !== 0) {
    const FfTailLines = 4;
    print(`ffmpeg failed: ${res.stderr.split("\n").slice(-FfTailLines).join("\n")}`);
    return false;
  }
  return true;
}

const GIF_FPS_SCALE = "fps=20,scale=960:-1:flags=lanczos";
const STRIP_FILTER = "fps=8.33,scale=700:-1,tile=6x1:padding=2";

/** GIF (two-pass palette for crisp UI colors) + per-click strips + optional per-step frames. */
export async function renderArtifacts(job: RenderJob): Promise<Rendered> {
  const { ffmpeg, rec, webm, outDir, opts } = job;
  const gif = join(outDir, `${opts.out}.gif`);
  const palette = join(outDir, `.${opts.out}-palette.png`);
  const paletteOk = runFfmpeg(ffmpeg, ["-y", "-i", webm, "-vf", `${GIF_FPS_SCALE},palettegen`, palette]);
  const gifOk = paletteOk && runFfmpeg(ffmpeg, ["-y", "-i", webm, "-i", palette, "-lavfi", `${GIF_FPS_SCALE}[x];[x][1:v]paletteuse`, gif]);
  await rm(palette, { force: true });

  // Per-click windows: 6 tiles × 120ms starting just before each click — count tiles
  // from the marker flip to first motion.
  let strips = 0;
  for (const [i, ct] of rec.clickTimes.entries()) {
    const start = Math.max(0, ct.t / MS_PER_S - CLICK_STRIP_PRE_S);
    const win = join(outDir, `${opts.out}-click${i + 1}.png`);
    const ok = runFfmpeg(ffmpeg, ["-y", "-ss", start.toFixed(2), "-t", String(CLICK_STRIP_LEN_S), "-i", webm, "-vf", STRIP_FILTER, "-frames:v", "1", win]);
    if (ok) {
      strips += 1;
      print(`click ${i + 1}      t=${ct.t}ms ${ct.label} → ${win}  (6 tiles × 120ms)`);
    }
  }

  // Full-res per-step frames (--frames): the post-animation moment per interaction, for
  // review without scrubbing the GIF.
  let frames = 0;
  if (opts.framesOffsetMs !== null) {
    for (const [i, st] of rec.stepTimeline.entries()) {
      const at = Math.max(0, (st.t + opts.framesOffsetMs) / MS_PER_S);
      const frame = join(outDir, `${opts.out}-step${i + 1}.png`);
      const ok = runFfmpeg(ffmpeg, ["-y", "-ss", at.toFixed(2), "-i", webm, "-frames:v", "1", frame]);
      if (ok) {
        frames += 1;
        print(`step ${i + 1}       t=${st.t}ms+${opts.framesOffsetMs} ${st.label} → ${frame}`);
      }
    }
  }
  return { gif: gifOk ? gif : null, strips, frames };
}
