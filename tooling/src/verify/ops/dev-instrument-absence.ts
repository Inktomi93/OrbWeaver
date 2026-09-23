// The boot-chunk stage's DEV-instrument question, run over the build `ops/boot-chunk-ratchet.ts` already
// made: are the client's DEV-only instruments absent from EVERY emitted chunk, preloaded or lazy?
//
// The build runs with `--sourcemap hidden`, which writes one `.map` beside each chunk and adds no reference
// comment to the chunk, so the bytes the ratchet weighs are unchanged. The maps' `sources` are the shipped
// module set. The bundler writes no map for a pure facade chunk (only imports and re-exports, whose code
// lives in a mapped chunk); any other chunk without a map is a blind spot and refuses. The source value-import graph comes from one dependency-cruiser walk of the client entry, with
// the same config the import gates run. The judgment and the declared roots are
// `lib/dev-instrument-absence.ts`. The maps are removed after the read whatever the outcome, because the
// prod stack serves `packages/client/dist/`.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { ExitCode } from "@orb/tooling/_shared/exit-contract";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { budget } from "@orb/tooling/_shared/load-budget";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import type { DevInstrumentVerdict } from "../contract/dev-instrument-absence.ts";
import {
  chunkSources,
  DEV_ONLY_INSTRUMENTS,
  devBranchImports,
  isFacadeChunk,
  judgeDevInstruments,
  resolveSpecifier,
  valueGraphFromCruise,
} from "../lib/dev-instrument-absence.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:boot-chunk");

/** The vite CLI arguments that make the build emit the maps this check reads. */
export const HIDDEN_SOURCEMAP_ARGS: readonly string[] = ["--sourcemap", "hidden"];

const ASSETS_REL = "packages/client/dist/assets";
/** The client entry, whose `import.meta.env.DEV` branch declares the dev-only instruments. */
const CLIENT_ENTRY_REL = "packages/client/src/main.tsx";
const CHUNK_SUFFIX = ".js";
const MAP_SUFFIX = ".map";
const CHUNK_MAP_SUFFIX = `${CHUNK_SUFFIX}${MAP_SUFFIX}`;
/** One dependency-cruiser walk of the client entry's graph; a ceiling on a wedge, load-scaled. */
const GRAPH_TIMEOUT_MS_BASE = 120_000;
const GRAPH_TIMEOUT_MS = budget(GRAPH_TIMEOUT_MS_BASE);

function assetNames(root: string): readonly string[] {
  const assets = join(root, ASSETS_REL);
  return existsSync(assets) ? readdirSync(assets) : [];
}

/** The basenames of every emitted chunk sourcemap; none when the build left no assets dir. */
function chunkMapNames(root: string): readonly string[] {
  return assetNames(root).filter((name) => name.endsWith(CHUNK_MAP_SUFFIX));
}

/** Delete every chunk sourcemap the hidden-sourcemap build wrote. */
export function removeChunkSourcemaps(root: string): void {
  for (const name of chunkMapNames(root)) {
    rmSync(join(root, ASSETS_REL, name), { force: true });
  }
}

async function measureDevInstruments(root: string): Promise<DevInstrumentVerdict> {
  const devBranch = devBranchImports(readFileSync(join(root, CLIENT_ENTRY_REL), "utf8")).map((specifier) => resolveSpecifier(CLIENT_ENTRY_REL, specifier));
  const cruise = await spawnNiced("pnpm", ["exec", "depcruise", CLIENT_ENTRY_REL, "--config", ".dependency-cruiser.cjs", "--output-type", "json"], {
    cwd: root,
    timeoutMs: GRAPH_TIMEOUT_MS,
  });
  if (cruise.code !== 0) {
    throw new Error(`dev-instrument-absence: the dependency-cruiser walk of ${CLIENT_ENTRY_REL} exited ${String(cruise.code)}:\n${cruise.stderr.trimEnd()}`);
  }
  const chunks = new Map<string, readonly string[]>();
  for (const name of chunkMapNames(root)) {
    const mapRel = `${ASSETS_REL}/${name}`;
    chunks.set(mapRel.slice(0, -MAP_SUFFIX.length), chunkSources(JSON.parse(readFileSync(join(root, mapRel), "utf8")), mapRel));
  }
  const unmappedCode = assetNames(root)
    .map((name) => `${ASSETS_REL}/${name}`)
    .filter((chunk) => chunk.endsWith(CHUNK_SUFFIX) && !chunks.has(chunk) && !isFacadeChunk(readFileSync(join(root, chunk), "utf8")));
  const graph = valueGraphFromCruise(JSON.parse(cruise.stdout));
  return judgeDevInstruments({ entry: CLIENT_ENTRY_REL, roots: DEV_ONLY_INSTRUMENTS, devBranch, graph, chunks, unmappedCode });
}

function reportDevInstruments(verdict: DevInstrumentVerdict): ExitCode {
  if (verdict.unmeasurable !== null) {
    process.stdout.write(
      `dev-instrument-absence — TOOL ERROR: ${verdict.unmeasurable}\n  The check could not measure, so this run is not a verdict (exit 2).\n`,
    );
    return EXIT.toolError;
  }
  process.stdout.write(
    `dev-instrument-absence — ${String(verdict.devOnly.length)} DEV-only module(s) behind ${String(verdict.roots.length)} declared instrument(s); ` +
      `${String(verdict.chunks)} chunk(s), ${String(verdict.sources)} source entries read\n`,
  );
  if (verdict.leaks.length === 0) {
    process.stdout.write("  ✓ no production chunk carries a DEV-only module\n");
    return EXIT.clean;
  }
  for (const leak of verdict.leaks) {
    process.stdout.write(`  ✗ ${leak.chunk} carries ${leak.module}\n`);
  }
  process.stdout.write(
    "  FIX: a production module imports a DEV-only instrument (or something only it reaches) outside the\n" +
      `  \`import.meta.env.DEV\` branch of ${CLIENT_ENTRY_REL}. Move that import back behind the branch.\n`,
  );
  return EXIT.violations;
}

/** Judge the finished hidden-sourcemap build. Exit 0 = no chunk carries a DEV-only module; 1 = a leak is
 *  named; 2 = the check could not measure. */
export async function runDevInstrumentAbsence(root: string): Promise<ExitCode> {
  return reportDevInstruments(await measureDevInstruments(root));
}
