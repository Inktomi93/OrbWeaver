// Outbound-only video normalization. Forced demuxers and disabled MOV data references prevent
// uploaded bytes from becoming playlists or paths; output is counted before it is retained.
import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type { VideoMaxResolution } from "@orb/contracts/inference";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import { ffmpegPath } from "node-av/ffmpeg";
import type { VideoPreparationOptions } from "./contract.ts";

export type { VideoPreparationOptions } from "./contract.ts";

const VIDEO_1080_WIDTH = 1920;
const VIDEO_1080_HEIGHT = 1080;
const VIDEO_720_WIDTH = 1280;
const VIDEO_720_HEIGHT = 720;
const VIDEO_480_WIDTH = 854;
const VIDEO_480_HEIGHT = 480;
const DIMENSIONS: Record<Exclude<VideoMaxResolution, "original">, readonly [number, number]> = {
  "1080": [VIDEO_1080_WIDTH, VIDEO_1080_HEIGHT],
  "720": [VIDEO_720_WIDTH, VIDEO_720_HEIGHT],
  "480": [VIDEO_480_WIDTH, VIDEO_480_HEIGHT],
};
const DEMUXERS = new Map([
  ["video/mp4", "mov"],
  ["video/webm", "matroska"],
  ["image/gif", "gif"],
]);
const TRANSCODE_TIMEOUT_MS = 60_000;
const VIDEO_MAX_PIXELS = 40_000_000;
const FRAGMENT_DURATION_US = 1_000_000;

function scheduleWithTimer(fn: () => void, ms: number): () => void {
  const timer = setTimeout(fn, ms);
  timer.unref();
  return () => clearTimeout(timer);
}

function videoArguments(input: string, demuxer: string, resolution: VideoMaxResolution, maxBytes: number): string[] {
  const argv = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-threads",
    "2",
    "-filter_threads",
    "2",
    "-max_pixels",
    String(VIDEO_MAX_PIXELS),
    "-protocol_whitelist",
    "file",
    "-f",
    demuxer,
    "-format_whitelist",
    demuxer,
  ];
  if (demuxer === "mov") {
    argv.push("-enable_drefs", "0", "-use_absolute_path", "0");
  }
  if (demuxer === "gif") {
    argv.push("-ignore_loop", "1");
  }
  argv.push("-i", input, "-map", "0:V:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1");
  if (resolution !== "original") {
    const [width, height] = DIMENSIONS[resolution];
    argv.push("-vf", `scale=w='min(${width},iw)':h='min(${height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`);
  } else {
    argv.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2");
  }
  argv.push(
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-f",
    "mp4",
    "-movflags",
    "+frag_keyframe+empty_moov+default_base_moof",
    "-frag_duration",
    String(FRAGMENT_DURATION_US),
    "-frag_size",
    String(maxBytes),
    "pipe:1",
  );
  return argv;
}

async function collectVideoOutput(
  child: ChildProcessByStdio<null, Readable, Readable>,
  maxBytes: number,
  signal: AbortSignal | undefined,
  scheduleTimeout: (fn: () => void, ms: number) => () => void,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let outputBytes = 0;
  let failure: Error | undefined;
  let closed = false;
  let stopping = false;
  const stopped = Promise.withResolvers<void>();
  const stop = (): void => {
    if (!(closed || stopping)) {
      stopping = true;
      child.kill("SIGKILL");
    }
  };
  const fail = (error: Error): void => {
    failure ??= error;
    stop();
  };
  child.once("error", fail);
  child.stdout.once("error", fail);
  child.stderr.once("error", fail);
  child.once("close", (code) => {
    closed = true;
    if (code !== 0) {
      failure ??= new Error("The attachment could not be prepared as video.");
    }
    stopped.resolve();
  });
  child.stdout.on("data", (chunk: Buffer) => {
    if (failure !== undefined || stopping) {
      return;
    }
    if (chunk.byteLength > maxBytes - outputBytes) {
      fail(new Error("The resized video exceeds the attachment byte limit."));
      return;
    }
    outputBytes += chunk.byteLength;
    chunks.push(chunk);
  });
  // Demuxer diagnostics contain input-controlled text and local paths; drain without retaining them.
  child.stderr.resume();
  signal?.addEventListener("abort", stop, { once: true });
  const cancelDeadline = scheduleTimeout(() => fail(new Error("The video preparation timed out.")), TRANSCODE_TIMEOUT_MS);
  try {
    if (signal?.aborted === true) {
      stop();
    }
    await stopped.promise;
  } finally {
    cancelDeadline();
    signal?.removeEventListener("abort", stop);
  }
  signal?.throwIfAborted();
  if (failure !== undefined) {
    throw failure;
  }
  if (outputBytes === 0) {
    throw new Error("The attachment could not be prepared as video.");
  }
  const output = Buffer.concat(chunks, outputBytes);
  return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
}

/** Bind the decoder's owned deadline without replacing the caller's cancellation signal. */
export function createVideoPreparer(scheduleTimeout: (fn: () => void, ms: number) => () => void = scheduleWithTimer) {
  return async function prepare(bytes: Uint8Array, mime: string, resolution: VideoMaxResolution, options: VideoPreparationOptions = {}): Promise<Uint8Array> {
    const { signal, maxBytes = ASSET_UPLOAD_MAX_BYTES } = options;
    signal?.throwIfAborted();
    if (bytes.byteLength > maxBytes) {
      throw new Error("The video exceeds the attachment byte limit.");
    }
    const baseMime = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const demuxer = DEMUXERS.get(baseMime);
    if (demuxer === undefined) {
      throw new Error("The attachment is not a supported video format.");
    }
    if (resolution === "original" && baseMime !== "image/gif") {
      return bytes;
    }
    const directory = await mkdtemp(join(tmpdir(), "orb-outbound-video-"));
    try {
      signal?.throwIfAborted();
      const input = join(directory, "source");
      await writeFile(input, bytes, { mode: 0o600, ...(signal === undefined ? {} : { signal }) });
      signal?.throwIfAborted();
      const argv = videoArguments(input, demuxer, resolution, maxBytes);
      const child = spawn(ffmpegPath(), argv, { cwd: directory, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      return await collectVideoOutput(child, maxBytes, signal, scheduleTimeout);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}

/** Resize an admitted stored video to MP4 bytes without touching its stored original. */
export const prepareVideo = createVideoPreparer();
