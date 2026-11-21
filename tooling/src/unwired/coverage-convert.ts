// Turns raw V8 coverage into istanbul maps with ast-v8-to-istanbul, the converter `@vitest/coverage-v8` runs, so the
// browser and server inputs describe functions and branches the way the Node suite's map does.
import { readdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import convert from "ast-v8-to-istanbul";
import { parse } from "vite";
import { z } from "zod";
import type { HitSegments } from "../floor/testing/coverage-collection.ts";
import { addHits, browserHitsFileSchema, COVERAGE_LAYOUT, flattenHits, functionCoverageSchema } from "../floor/testing/coverage-collection.ts";
import type { IstanbulMap } from "./coverage-merge.ts";
import { isHarnessProcess, istanbulMapSchema } from "./coverage-merge.ts";

// `NODE_V8_COVERAGE` writes one file per process, each with every script that process compiled.
const nodeDumpSchema = z.object({ result: z.array(z.object({ url: z.string(), functions: z.array(functionCoverageSchema) })) });
// The fields the converter needs; the original text it reads from the absolute source paths, not from sourcesContent.
const sourceMapSchema = z.object({ version: z.number(), names: z.array(z.string()), sources: z.array(z.string()), mappings: z.string() });

// The inline map `packages/client/vite.config.ts` writes under the command: the last line of each chunk.
const INLINE_MAP = /\n\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)\s*$/u;

const readJsonFiles = (dir: string): readonly unknown[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name): unknown => JSON.parse(readFileSync(join(dir, name), "utf8")));

/** Converts one executed script's hits; `url` names the file the converter reports when no source map does. */
export async function istanbulOf(url: string, code: string, segments: HitSegments, sourceMap?: z.infer<typeof sourceMapSchema>): Promise<IstanbulMap> {
  // One function whose flat segments carry every count: the converter reads an offset's count the same way.
  const functions = [{ functionName: "", isBlockCoverage: true, ranges: [...segments] }];
  const parsed = await parse("executed.js", code, { lang: "js", sourceType: "module" });
  const [failure] = parsed.errors;
  if (failure !== undefined) {
    throw new Error(`${url}: the executed code does not parse: ${failure.message}`);
  }
  const map = await convert({ code, ast: parsed.program, coverage: { url, functions }, ...(sourceMap === undefined ? {} : { sourceMap }) });
  return istanbulMapSchema.parse(JSON.parse(JSON.stringify(map)));
}

/** The browser inputs of one suite: every worker's hits summed per script, then mapped to sources by the inline map. */
export async function convertBrowserRun(
  runDir: string,
): Promise<{ readonly map: IstanbulMap; readonly specs: readonly string[]; readonly unmapped: readonly string[] }> {
  const hits = new Map<string, { readonly source: string; segments: HitSegments }>();
  const specs = new Set<string>();
  for (const raw of readJsonFiles(join(runDir, COVERAGE_LAYOUT.browser))) {
    const worker = browserHitsFileSchema.parse(raw);
    for (const spec of worker.specs) {
      specs.add(spec);
    }
    for (const script of worker.scripts) {
      const held = hits.get(script.url);
      hits.set(script.url, { source: script.source, segments: held === undefined ? script.segments : addHits(held.segments, script.segments) });
    }
  }
  const map: IstanbulMap = {};
  const unmapped: string[] = [];
  for (const [url, { source, segments }] of hits) {
    const path = join(runDir, COVERAGE_LAYOUT.sources, source);
    const code = readFileSync(path, "utf8");
    const inline = INLINE_MAP.exec(code)?.[1];
    // A chunk with no inline map was not built under the command, so no position in it names a source file.
    if (inline !== undefined) {
      const sourceMap = sourceMapSchema.parse(JSON.parse(Buffer.from(inline, "base64").toString("utf8")));
      Object.assign(map, await istanbulOf(pathToFileURL(path).href, code, segments, sourceMap));
    } else {
      unmapped.push(url);
    }
  }
  return { map, specs: [...specs].sort(), unmapped: unmapped.sort() };
}

/**
 * The Node process inputs of one suite: harness processes dropped, each product script's hits summed over processes.
 *
 * @remarks Node strips types by replacing them with blanks, so the stripped text keeps every offset V8 reported.
 */
export async function convertNodeRun(root: string, runDir: string): Promise<IstanbulMap> {
  const hits = new Map<string, HitSegments>();
  for (const raw of readJsonFiles(join(runDir, COVERAGE_LAYOUT.node))) {
    const scripts = nodeDumpSchema.parse(raw).result.filter((script) => script.url.startsWith("file:"));
    if (
      isHarnessProcess(
        root,
        scripts.map((script) => fileURLToPath(script.url)),
      )
    ) {
      continue;
    }
    for (const script of scripts) {
      const segments = flattenHits(script.functions);
      const held = hits.get(script.url);
      hits.set(script.url, held === undefined ? segments : addHits(held, segments));
    }
  }
  const map: IstanbulMap = {};
  for (const [url, segments] of hits) {
    const path = fileURLToPath(url);
    if (!path.includes("/node_modules/")) {
      const source = readFileSync(path, "utf8");
      Object.assign(map, await istanbulOf(url, path.endsWith(".ts") ? stripTypeScriptTypes(source, { mode: "strip" }) : source, segments));
    }
  }
  return map;
}
