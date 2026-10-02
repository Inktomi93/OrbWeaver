// Real FFmpeg fixtures prove format confinement and bounded wire output, not only command construction.
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import type { VideoMaxResolution } from "@orb/contracts/inference";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import { createVideoPreparer, prepareVideo } from "@orb/server/infra/media";
import { z } from "zod";
import { test as base, expect } from "../../../support/fixtures.ts";

const run = promisify(execFile);
const FRAME_WIDTH = 2000;
const FRAME_HEIGHT = 1000;
const CODEC_NAME = "codec_name";
const CODEC_TYPE = "codec_type";
const PIXEL_FORMAT = "pix_fmt";
const FORMAT_NAME = "format_name";
const FFPROBE_RESULT = z.object({
  streams: z.array(
    z.object({
      [CODEC_NAME]: z.string(),
      [CODEC_TYPE]: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      [PIXEL_FORMAT]: z.string().optional(),
      tags: z.record(z.string(), z.string()).optional(),
    }),
  ),
  chapters: z.array(z.object({ tags: z.record(z.string(), z.string()).optional() })),
  format: z.object({ [FORMAT_NAME]: z.string(), tags: z.record(z.string(), z.string()).optional() }),
});

const test = base.extend<{ directory: string }>({
  directory: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "orb-media-test-"));
    try {
      await use(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
});

async function ffmpeg(argv: readonly string[]): Promise<Buffer> {
  const { stdout } = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-filter_threads", "1", ...argv], {
    encoding: "buffer",
    maxBuffer: ASSET_UPLOAD_MAX_BYTES,
  });
  return stdout;
}

async function motion(directory: string, format: "mp4" | "webm", dimensions = "32x16"): Promise<Buffer> {
  const target = join(directory, `source-${dimensions}.${format}`);
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `color=c=red:s=${dimensions}:r=2:d=1`,
    "-frames:v",
    "2",
    "-c:v",
    format === "mp4" ? "libx264" : "libvpx-vp9",
    "-threads",
    "1",
    target,
  ]);
  return await readFile(target);
}

async function probe(directory: string, bytes: Uint8Array): Promise<z.infer<typeof FFPROBE_RESULT>> {
  const output = join(directory, "output.mp4");
  await writeFile(output, bytes);
  const result = await run("ffprobe", ["-v", "error", "-show_streams", "-show_chapters", "-show_format", "-of", "json", output], {
    maxBuffer: ASSET_UPLOAD_MAX_BYTES,
  });
  return FFPROBE_RESULT.parse(JSON.parse(result.stdout));
}

// The QuickTime alias points to a benign fixture with identical mdat offsets; moov remains after mdat.
function externalTrackMov(source: Buffer, path: string): Buffer {
  const encoded = Buffer.from(path);
  const paddedLength = encoded.byteLength + (encoded.byteLength % 2);
  const alias = Buffer.alloc(170 + paddedLength);
  alias.writeUInt32BE(alias.byteLength);
  alias.write("alis", 4);
  alias[22] = 1;
  alias.write("V", 23);
  alias[62] = 1;
  alias.write("a", 63);
  alias.writeUInt16BE(2, 162);
  alias.writeUInt16BE(paddedLength, 164);
  encoded.copy(alias, 166);
  alias.writeUInt16BE(0xff_ff, 166 + paddedLength);
  const containers = new Set(["moov", "trak", "mdia", "minf", "dinf"]);
  function rewrite(bytes: Buffer): Buffer {
    const parts: Buffer[] = [];
    for (let cursor = 0; cursor < bytes.byteLength; ) {
      const length = bytes.readUInt32BE(cursor);
      const kind = bytes.toString("ascii", cursor + 4, cursor + 8);
      const atom = bytes.subarray(cursor, cursor + length);
      if (kind === "dref" || containers.has(kind)) {
        const replaced = kind === "dref" ? Buffer.concat([atom.subarray(0, 16), alias]) : Buffer.concat([atom.subarray(0, 8), rewrite(atom.subarray(8))]);
        replaced.writeUInt32BE(replaced.byteLength);
        parts.push(replaced);
      } else {
        parts.push(atom);
      }
      cursor += length;
    }
    return Buffer.concat(parts);
  }
  return rewrite(source);
}

for (const format of ["mp4", "webm"] as const) {
  test(`seekable ${format} input normalizes to one H264 yuv420p MP4 stream without enlarging`, async ({ directory }) => {
    // The MP4 source has its moov at EOF: the adapter must not replace seekable input with a pipe.
    const source = await motion(directory, format);
    const prepared = await prepareVideo(source, `video/${format}`, "720");
    const metadata = await probe(directory, prepared);
    expect(metadata.format[FORMAT_NAME]).toContain("mp4");
    expect(metadata.streams).toEqual([
      expect.objectContaining({ [CODEC_TYPE]: "video", [CODEC_NAME]: "h264", [PIXEL_FORMAT]: "yuv420p", width: 32, height: 16 }),
    ]);
    expect(await prepareVideo(source, `video/${format}`, "original")).toBe(source);
  });
}

test("each preset clamps its box and preserves source aspect instead of stretching", async ({ directory }) => {
  const source = await motion(directory, "mp4", `${FRAME_WIDTH}x${FRAME_HEIGHT}`);
  const cases: readonly [VideoMaxResolution, number, number, number][] = [
    ["1080", 1920, 960, 1080],
    ["720", 1280, 640, 720],
    ["480", 854, 427, 480],
  ];
  for (const [resolution, width, heightAtSourceAspect, maxHeight] of cases) {
    const metadata = await probe(directory, await prepareVideo(source, "video/mp4", resolution));
    const video = metadata.streams[0];
    expect(video).toMatchObject({ width });
    expect(video?.height).toBeDefined();
    const height = video?.height ?? 0;
    expect(height).toBeGreaterThan(0);
    expect(height % 2).toBe(0);
    expect(height).toBeLessThanOrEqual(Math.min(maxHeight, FRAME_HEIGHT));
    expect(width).toBeLessThanOrEqual(FRAME_WIDTH);
    // FFmpeg versions round the 427px aspect height either way to an even pixel, never beyond one pixel.
    expect(Math.abs(height - heightAtSourceAspect)).toBeLessThanOrEqual(1);
    expect((video?.width ?? 0) / (video?.height ?? 1)).toBeCloseTo(FRAME_WIDTH / FRAME_HEIGHT, 2);
  }
});

test("animated GIF becomes finite MP4 even at original quality despite an infinite loop tag", async ({ directory }) => {
  const gif = join(directory, "animated.gif");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=32x16:r=2:d=1", "-frames:v", "2", "-threads", "1", "-loop", "0", gif]);
  const source = await readFile(gif);
  const metadata = await probe(directory, await prepareVideo(source, "image/gif", "original"));
  expect(metadata.format[FORMAT_NAME]).toContain("mp4");
  expect(metadata.streams).toEqual([expect.objectContaining({ [CODEC_TYPE]: "video", [CODEC_NAME]: "h264", width: 32, height: 16 })]);
});

test("a real under-input-cap GIF producing over-cap MP4 refuses rather than returning a truncated clip", async ({ directory }) => {
  const gif = join(directory, "small.gif");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=16x16:r=1:d=1", "-frames:v", "1", "-threads", "1", gif]);
  const source = await readFile(gif);
  const smallCap = 1024;
  expect(source.byteLength).toBeLessThan(smallCap);
  expect((await prepareVideo(source, "image/gif", "720")).byteLength).toBeGreaterThan(smallCap);
  await expect(prepareVideo(source, "image/gif", "720", { maxBytes: smallCap })).rejects.toThrow("resized video exceeds");
});

test("all admitted MIME labels reject a playlist that unrestricted FFmpeg can use to read outside the input directory", async ({ directory }) => {
  const segment = join(directory, "outside.ts");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=16x16:r=1:d=1", "-frames:v", "1", "-c:v", "libx264", "-threads", "1", "-f", "mpegts", segment]);
  const playlist = Buffer.from(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1,\n${segment}\n#EXT-X-ENDLIST\n`);
  const control = join(directory, "control.m3u8");
  await writeFile(control, playlist);
  await ffmpeg(["-protocol_whitelist", "file,pipe", "-i", control, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"]);
  for (const mime of ["video/mp4", "video/webm", "image/gif"]) {
    await expect(prepareVideo(playlist, mime, "720")).rejects.toThrow("could not be prepared");
  }
});

test("MOV external tracks are disabled even when a valid MP4 carries a local-file alias", async ({ directory }) => {
  const source = await motion(directory, "mp4");
  const outside = join(directory, "source-32x16.mp4");
  const aliased = externalTrackMov(source, outside);
  const input = join(directory, "external-track.mp4");
  await writeFile(input, aliased);
  const control = await ffmpeg([
    "-f",
    "mov",
    "-enable_drefs",
    "1",
    "-use_absolute_path",
    "1",
    "-i",
    input,
    "-map",
    "0:V:0",
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  expect(control.byteLength).toBe(32 * 16 * 3);
  await expect(prepareVideo(aliased, "video/mp4", "720")).rejects.toThrow("could not be prepared");
});

test("source metadata and chapters do not travel with the selected video and optional audio", async ({ directory }) => {
  const metadata = join(directory, "metadata.txt");
  await writeFile(
    metadata,
    ";FFMETADATA1\ntitle=private-title\ncomment=private-location\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000\ntitle=private-chapter\n",
  );
  const input = join(directory, "annotated.mp4");
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=32x16:r=2:d=1",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=8000:cl=mono",
    "-f",
    "ffmetadata",
    "-i",
    metadata,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-map_metadata",
    "2",
    "-map_chapters",
    "2",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-c:a",
    "aac",
    input,
  ]);
  const original = await readFile(input);
  const before = await probe(directory, original);
  expect(before.format.tags?.["title"]).toBe("private-title");
  expect(before.chapters).toHaveLength(1);
  const after = await probe(directory, await prepareVideo(original, "video/mp4", "720"));
  expect(after.streams.map((stream) => stream[CODEC_TYPE])).toEqual(["video", "audio"]);
  expect(after.streams.map((stream) => stream[CODEC_NAME])).toEqual(["h264", "aac"]);
  expect(after.chapters).toEqual([]);
  expect(JSON.stringify(after)).not.toContain("private-");
});

test("corrupt media failures have no raw FFmpeg diagnostic cause or byte pass-through", async () => {
  await expect(prepareVideo(Uint8Array.from([1, 2, 3]), "video/mp4", "720")).rejects.not.toHaveProperty("cause");
});

test("cancelling a real decoder preserves an independently running sibling process", async ({ directory }) => {
  const source = await motion(directory, "mp4");
  const sibling = spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdio: ["pipe", "ignore", "ignore"] });
  const closed = once(sibling, "close");
  try {
    await once(sibling, "spawn");
    const controller = new AbortController();
    const reason = new Error("stop decoder only");
    const prepare = createVideoPreparer(() => {
      controller.abort(reason);
      return (): void => undefined;
    });
    await expect(prepare(source, "video/mp4", "720", { signal: controller.signal })).rejects.toBe(reason);
    if (sibling.pid === undefined) {
      throw new Error("The control process did not start.");
    }
    expect(process.kill(sibling.pid, 0)).toBe(true);
  } finally {
    sibling.kill("SIGKILL");
    await closed;
  }
});
