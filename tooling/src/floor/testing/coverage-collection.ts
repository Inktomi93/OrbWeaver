// Coverage collection for `pnpm unwired coverage`: the env the command sets, the hit segments every input reduces to,
// and the Playwright fixtures that record Chromium coverage per test. With the env unset the fixtures are not
// registered, so a normal run gets no extra fixtures and creates no page or context it would not have created anyway.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import type { CDPSession, Fixtures, Page, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions } from "@playwright/test";
import { z } from "zod";
import { inheritedProcessEnv } from "../process/process-env.ts";

/** The run folder `pnpm unwired coverage` hands each suite. `packages/client/vite.config.ts` mirrors the name (D344). */
export const COVERAGE_DIR_ENV = "ORB_COVERAGE_DIR";

/** Where each input lands inside the run folder. */
export const COVERAGE_LAYOUT = {
  /** One hits file per Playwright worker. */
  browser: "browser",
  /** The executed source of each browser script, once per URL. */
  sources: "sources",
  /** `NODE_V8_COVERAGE` dumps of the e2e server processes. */
  node: "node",
} as const;

/** The run folder, when this process runs under `pnpm unwired coverage`. */
export function coverageDirectory(env: NodeJS.ProcessEnv = inheritedProcessEnv()): string | undefined {
  const dir = env[COVERAGE_DIR_ENV];
  return dir === undefined || dir === "" ? undefined : dir;
}

/** One V8 block range, as the inspector protocol and `NODE_V8_COVERAGE` report it. */
export const coverageRangeSchema = z.object({ startOffset: z.number(), endOffset: z.number(), count: z.number() }).readonly();
export type CoverageRange = z.infer<typeof coverageRangeSchema>;

/** One V8 function entry: its first range is the function, the rest are blocks inside it. */
export const functionCoverageSchema = z
  .object({ functionName: z.string(), ranges: z.array(coverageRangeSchema).readonly(), isBlockCoverage: z.boolean() })
  .readonly();
export type FunctionCoverage = z.infer<typeof functionCoverageSchema>;

/** Non-overlapping `[start, end)` segments, sorted, each with the innermost range's count. */
export type HitSegments = readonly CoverageRange[];

/**
 * Flattens a script's nested ranges so each offset carries the count of the innermost range around it.
 *
 * @remarks This is how ast-v8-to-istanbul reads a count, so segments fed back to it as one function yield the same
 * hits the nested ranges did. V8 nests ranges properly, so a stack sweep suffices.
 */
export function flattenHits(functions: readonly FunctionCoverage[]): HitSegments {
  const ranges = functions
    .flatMap((entry) => entry.ranges)
    .filter((range) => range.endOffset > range.startOffset)
    .toSorted((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  const out: CoverageRange[] = [];
  const open: CoverageRange[] = [];
  let cursor = 0;
  const emitTo = (to: number): void => {
    const top = open.at(-1);
    if (top !== undefined && to > cursor) {
      pushSegment(out, { startOffset: cursor, endOffset: to, count: top.count });
    }
    cursor = Math.max(cursor, to);
  };
  const closeBefore = (offset: number): void => {
    for (let top = open.at(-1); top !== undefined && top.endOffset <= offset; top = open.at(-1)) {
      emitTo(top.endOffset);
      open.pop();
    }
  };
  for (const range of ranges) {
    closeBefore(range.startOffset);
    emitTo(range.startOffset);
    open.push(range);
  }
  closeBefore(Number.POSITIVE_INFINITY);
  return out;
}

// Adjacent segments with one count are one segment, so a merged file stays the size of its distinct counts.
function pushSegment(out: CoverageRange[], segment: CoverageRange): void {
  const last = out.at(-1);
  if (last !== undefined && last.endOffset === segment.startOffset && last.count === segment.count) {
    out[out.length - 1] = { startOffset: last.startOffset, endOffset: segment.endOffset, count: last.count };
    return;
  }
  out.push(segment);
}

// Walks one sorted segment list forward: the segment covering each ascending offset, or none in a gap.
function segmentCursor(segments: HitSegments): (offset: number) => CoverageRange | undefined {
  let index = 0;
  return (offset) => {
    while ((segments[index]?.endOffset ?? Number.POSITIVE_INFINITY) <= offset) {
      index++;
    }
    const segment = segments[index];
    return segment !== undefined && segment.startOffset <= offset ? segment : undefined;
  };
}

/** Sums two segment lists offset by offset; an offset either one covers stays covered. */
export function addHits(a: HitSegments, b: HitSegments): HitSegments {
  const bounds = [...new Set([...a, ...b].flatMap((range) => [range.startOffset, range.endOffset]))].toSorted((x, y) => x - y);
  const inA = segmentCursor(a);
  const inB = segmentCursor(b);
  const out: CoverageRange[] = [];
  for (const [index, start] of bounds.entries()) {
    const end = bounds[index + 1];
    const left = inA(start);
    const right = inB(start);
    if (end !== undefined && (left !== undefined || right !== undefined)) {
      pushSegment(out, { startOffset: start, endOffset: end, count: (left?.count ?? 0) + (right?.count ?? 0) });
    }
  }
  return out;
}

/** One worker's browser hits file: the spec files that ran with collection on, and each script's summed hits. */
export const browserHitsFileSchema = z
  .object({
    specs: z.array(z.string()).readonly(),
    /** One line per page whose coverage could not be started or taken, so a lost page is counted, never silent. */
    lost: z.array(z.string()).readonly(),
    scripts: z.array(z.object({ url: z.string(), source: z.string(), segments: z.array(coverageRangeSchema).readonly() }).readonly()).readonly(),
  })
  .readonly();
type BrowserHitsFile = z.infer<typeof browserHitsFileSchema>;

/** The file name a script's executed source is saved under. */
export const sourceFileName = (url: string): string => `${createHash("sha256").update(url).digest("hex")}.js`;

// Several workers save one bundle; a rename publishes the whole file or nothing.
function publish(path: string, text: string): void {
  if (existsSync(path)) {
    return;
  }
  const scratch = `${path}.${String(process.pid)}.tmp`;
  writeFileSync(scratch, text);
  renameSync(scratch, path);
}

/** One worker's summed hits, flushed to its own hits file when the worker ends. */
export class BrowserHitsSink {
  readonly #dir: string;
  readonly #hits = new Map<string, HitSegments>();
  readonly #specs = new Set<string>();
  readonly #lost: string[] = [];

  constructor(dir: string) {
    this.#dir = dir;
    mkdirSync(join(dir, COVERAGE_LAYOUT.browser), { recursive: true });
    mkdirSync(join(dir, COVERAGE_LAYOUT.sources), { recursive: true });
  }

  hasSource(url: string): boolean {
    return this.#hits.has(url) || existsSync(join(this.#dir, COVERAGE_LAYOUT.sources, sourceFileName(url)));
  }

  saveSource(url: string, source: string): void {
    publish(join(this.#dir, COVERAGE_LAYOUT.sources, sourceFileName(url)), source);
  }

  add(url: string, segments: HitSegments): void {
    const held = this.#hits.get(url);
    this.#hits.set(url, held === undefined ? segments : addHits(held, segments));
  }

  noteSpec(file: string): void {
    this.#specs.add(relative(process.cwd(), file));
  }

  noteLost(file: string, error: unknown): void {
    this.#lost.push(`${relative(process.cwd(), file)}: ${error instanceof Error ? error.message : String(error)}`);
  }

  flush(workerIndex: number): void {
    const body: BrowserHitsFile = {
      specs: [...this.#specs].sort(),
      lost: this.#lost,
      scripts: [...this.#hits].map(([url, segments]) => ({ url, source: sourceFileName(url), segments })),
    };
    writeFileSync(join(this.#dir, COVERAGE_LAYOUT.browser, `${String(process.pid)}-${String(workerIndex)}.json`), JSON.stringify(body));
  }
}

// Only scripts the page fetched over HTTP are the app's; extensions and evaluated snippets have no file behind them.
const isServedScript = (url: string): boolean => url.startsWith("http://") || url.startsWith("https://");

async function startPage(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send("Profiler.enable");
  await session.send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  return session;
}

async function takePage(session: CDPSession, sink: BrowserHitsSink): Promise<void> {
  const { result } = await session.send("Profiler.takePreciseCoverage");
  let debuggerOn = false;
  for (const script of result.filter((entry) => isServedScript(entry.url))) {
    if (!sink.hasSource(script.url)) {
      if (!debuggerOn) {
        await session.send("Debugger.enable");
        debuggerOn = true;
      }
      const { scriptSource } = await session.send("Debugger.getScriptSource", { scriptId: script.scriptId });
      sink.saveSource(script.url, scriptSource);
    }
    sink.add(script.url, flattenHits(script.functions));
  }
  await session.detach();
}

interface BrowserCoverageFixtures {
  readonly browserCoverage: undefined;
}

interface BrowserCoverageWorkerFixtures {
  readonly browserCoverageSink: BrowserHitsSink;
}

type BaseTestArgs = PlaywrightTestArgs & PlaywrightTestOptions;
type BaseWorkerArgs = PlaywrightWorkerArgs & PlaywrightWorkerOptions;

/**
 * Takes each open page's coverage into the sink after a test.
 *
 * @remarks A page that closed or crashed mid-test cannot be read; it becomes a `lost` line, never a throw, so the
 * test keeps its own verdict.
 */
export async function recordPages(sessions: ReadonlyMap<Pick<Page, "isClosed">, Promise<CDPSession>>, sink: BrowserHitsSink, file: string): Promise<void> {
  for (const [page, session] of sessions) {
    try {
      if (!page.isClosed()) {
        await takePage(await session, sink);
      }
    } catch (error) {
      sink.noteLost(file, error);
    }
  }
}

/**
 * The fixtures that record Chromium coverage into `dir`, or none when there is no run folder.
 *
 * @remarks The test fixture depends on `context`, never `page`: a base that overrides `page` keeps its own
 * timing, and a case that never opens a page gets none. Its teardown never fails a test: a page it cannot read is a
 * `lost` line in the worker's hits file.
 */
export function browserCoverageFixtures(
  dir: string | undefined,
): Fixtures<BrowserCoverageFixtures, BrowserCoverageWorkerFixtures, BaseTestArgs, BaseWorkerArgs> {
  if (dir === undefined) {
    return {};
  }
  return {
    browserCoverageSink: [
      // Playwright reads a fixture's dependencies from its first parameter, and an empty pattern trips Biome's noEmptyPattern.
      async ({ browserName: _browser }, use, workerInfo): Promise<void> => {
        const sink = new BrowserHitsSink(dir);
        await use(sink);
        sink.flush(workerInfo.workerIndex);
      },
      { scope: "worker" },
    ],
    browserCoverage: [
      async ({ context, browserName, browserCoverageSink }, use, testInfo): Promise<void> => {
        // Profiler coverage is a Chromium protocol domain; the WebKit project runs without it.
        if (browserName !== "chromium") {
          await use(undefined);
          return;
        }
        const sessions = new Map<Page, Promise<CDPSession>>();
        const track = (page: Page): void => {
          const started = startPage(page);
          // Observed here so a page that closes before its session opens rejects into the lost list, not the test.
          started.catch(() => undefined);
          sessions.set(page, started);
        };
        for (const page of context.pages()) {
          track(page);
        }
        context.on("page", track);
        await use(undefined);
        context.off("page", track);
        await recordPages(sessions, browserCoverageSink, testInfo.file);
        browserCoverageSink.noteSpec(testInfo.file);
      },
      { auto: true },
    ],
  };
}

/** The fixtures every Playwright base extends with: empty unless this process runs under `pnpm unwired coverage`. */
export const BROWSER_COVERAGE_FIXTURES: Fixtures<BrowserCoverageFixtures, BrowserCoverageWorkerFixtures, BaseTestArgs, BaseWorkerArgs> =
  browserCoverageFixtures(coverageDirectory());
