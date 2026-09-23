// One-shot codemod: `domain/chat/memory/build/` (and its test mirror) becomes `memory/generate/`. The old name
// matched the repo-wide `build/` output ignore rule, so the folder rode a `.gitignore` negation that ripgrep does
// not honour — every rg-based absence claim about chat memory was blind to it. The negation lines are deleted by
// hand once nothing lives under the old name.
//
// Preview:  NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/memory-build-to-generate.ts
// Apply:    NODE_OPTIONS=--max-old-space-size=16384 node scripts/codemods/memory-build-to-generate.ts --apply

import process from "node:process";
import type { CodemodContext } from "@orb/tooling/codemod";
import { moveFiles, runCodemod } from "@orb/tooling/codemod";

const SRC = "packages/server/src/domain/chat/memory";
const TESTS = "tests/server/domain/chat/memory";
const SOURCE_FILES = [
  "digests.ts",
  "segments.ts",
  "substrate/parse.ts",
  "substrate/prompts.ts",
  "substrate/token-guard.ts",
  "substrate/transcript.ts",
  "substrate/witnessing.ts",
] as const;
const TEST_FILES = [
  "digests.int.test.ts",
  "segments.int.test.ts",
  "substrate/parse.test.ts",
  "substrate/prompts.test.ts",
  "substrate/token-guard.test.ts",
  "substrate/transcript.test.ts",
  "substrate/witnessing.test.ts",
] as const;

await runCodemod(
  "memory-build-to-generate",
  (ctx: CodemodContext) => {
    ctx.plan(
      moveFiles(ctx, [
        ...SOURCE_FILES.map((file) => [`${SRC}/build/${file}`, `${SRC}/generate/${file}`] as const),
        ...TEST_FILES.map((file) => [`${TESTS}/build/${file}`, `${TESTS}/generate/${file}`] as const),
      ]),
    );
  },
  { argv: process.argv.slice(2) },
);
