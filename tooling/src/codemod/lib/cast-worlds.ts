// Every native world's answer to one typed id-cast question. A file no world owns, or a site the worlds answer
// differently, gets no answer and a recorded skip, so a scan the worlds could not read never previews as empty.
import type { Node } from "ts-morph";
import { isLegacyTestPath, LEGACY_ANALYSIS_EXCLUSION_REASON } from "../../floor/testing/test-population.ts";
import type { CastSkip, WorldReader } from "../contract/cast-worlds.ts";
import type { CodemodContext } from "../contract/types.ts";
import { repoRelative } from "./plans.ts";

const NO_WORLD_REASON = "no native compiler world owns this file";
const WORLD_DISAGREEMENT_REASON = "native compiler worlds disagree";
const NO_ANSWER = "<none>";

export function worldReader(ctx: CodemodContext): WorldReader {
  return { semantic: ctx.semantic(), repoRoot: ctx.repoRoot, skips: [] };
}

function skipOnce(reader: WorldReader, skip: CastSkip): void {
  const seen = reader.skips.some((prior) => prior.arm === skip.arm && prior.path === skip.path && prior.line === skip.line && prior.reason === skip.reason);
  if (!seen) {
    reader.skips.push(skip);
  }
}

/** One answer from every native world that owns `node`'s file; a file no world owns, or answers that differ, record a skip. */
export function agreedInEveryWorld<T extends string | boolean>(
  reader: WorldReader,
  arm: string,
  node: Node,
  read: (local: Node) => T | undefined,
): T | undefined {
  const path = repoRelative(node.getSourceFile().getFilePath(), reader.repoRoot);
  const views = reader.semantic.sourceViews(node.getSourceFile().getFilePath());
  if (views.length === 0) {
    skipOnce(reader, { arm, path, line: undefined, reason: isLegacyTestPath(path) ? LEGACY_ANALYSIS_EXCLUSION_REASON : NO_WORLD_REASON });
    return;
  }
  const answers = views.map(({ program, sourceFile }) => {
    const local = sourceFile.getDescendantAtStartWithWidth(node.getStart(), node.getWidth());
    return { config: program.descriptor.config, answer: local === undefined ? undefined : read(local) };
  });
  const first = answers[0]?.answer;
  const agreed = answers.every(({ answer }) => answer === first);
  if (!agreed) {
    const worlds = answers.map(({ config, answer }) => `${config}=${answer === undefined ? NO_ANSWER : String(answer)}`).join(", ");
    skipOnce(reader, { arm, path, line: node.getStartLineNumber(), reason: `${WORLD_DISAGREEMENT_REASON}: ${worlds}` });
  }
  return agreed ? first : undefined;
}

/** Print every skip into the preview log. */
export function logSkips(ctx: CodemodContext, skips: readonly CastSkip[]): void {
  for (const { arm, path, line, reason } of skips) {
    ctx.log(`skipped ${line === undefined ? path : `${path}:${String(line)}`} (${arm}): ${reason}`);
  }
}

/** The plan-description tail that keeps a skipped scan from reading as an empty one. */
export function skipSuffix(skips: readonly CastSkip[]): string {
  return skips.length === 0 ? "" : `; ${String(skips.length)} skipped, see log`;
}
