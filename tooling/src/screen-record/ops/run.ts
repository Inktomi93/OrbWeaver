// The recording orchestration: record -> file the webm -> render (or SKIP without ffmpeg) ->
// timeline + console transcript + RESULT. Red only when the interaction itself broke.
import { copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { artifactDir } from "@orb/tooling/_shared/artifact-out";
import type { ResultPair } from "@orb/tooling/_shared/artifacts";
import { print, printResult } from "@orb/tooling/_shared/artifacts";
import { resolveFfmpeg } from "@orb/tooling/_shared/ffmpeg";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, Rendered } from "../contract/types.ts";
import { recordVideo } from "./record.ts";
import { renderArtifacts } from "./render.ts";

refuseDirectInvocation(import.meta.url, "pnpm record");

const T_PAD = 6;

export async function runScreenRecord(opts: Args): Promise<number> {
  const outDir = await artifactDir("recordings");
  const rec = await recordVideo(opts, outDir);

  if (rec.videoPath === null) {
    print("ERROR        no video produced");
    printResult("record", [
      ["video", "NONE"],
      ["step-failures", rec.failures],
    ]);
    return 1;
  }
  const webm = join(outDir, `${opts.out}.webm`);
  await copyFile(rec.videoPath, webm);
  await rm(join(outDir, `.video-${opts.out}`), { recursive: true, force: true });

  const ffmpeg = resolveFfmpeg();
  let rendered: Rendered = { gif: null, strips: 0, frames: 0 };
  if (ffmpeg === null) {
    print("SKIP         gif/strips/frames — no ffmpeg (FFMPEG_BIN or PATH); webm still recorded");
  } else {
    rendered = await renderArtifacts({ ffmpeg, rec, webm, outDir, opts });
  }

  print(`video        ${webm}`);
  if (rendered.gif !== null) {
    print(`gif          ${rendered.gif}`);
  }
  print("--- step timeline ---");
  for (const s of rec.stepTimeline) {
    print(`  ${String(s.t).padStart(T_PAD)}ms  ${s.label}`);
  }
  print(`--- console: ${rec.perfLines.length} perf/error line(s) ---`);
  for (const l of rec.perfLines) {
    print(`  ${String(l.t).padStart(T_PAD)}ms  ${l.label}`);
  }

  const skipReason = ffmpeg === null ? "SKIPPED(no-ffmpeg)" : null;
  const pairs: ResultPair[] = [
    ["video", webm],
    ["gif", skipReason ?? rendered.gif ?? "FAILED"],
    ["click-strips", skipReason ?? rendered.strips],
    ["step-frames", opts.framesOffsetMs === null ? "(off)" : (skipReason ?? rendered.frames)],
    ["steps", rec.stepTimeline.length],
    ["step-failures", rec.failures],
    ["page-errors", rec.pageErrors],
    ["perf-lines", rec.perfLines.length],
  ];
  printResult("record", pairs);
  // Skip ≠ fail (the ffmpeg contract); red only when the interaction itself broke.
  return rec.failures > 0 || rec.pageErrors > 0 ? 1 : 0;
}
