// The agent-sdk wire's REGISTRATION fact (inference program §8.4-1): "the bundled `claude` runtime resolves".
// This SDK version ships the CLI inside its own bundle (`extractFromBunfs`, no `cli.js` on disk) and spawns
// it itself unless `pathToClaudeCodeExecutable` overrides the path, so the honest probe is module
// resolution of the SDK entry — the path the runtime is launched from. `null` ⇒ the wire is not built and
// every `claude-sub` row reads `runtime-missing` (§5.3a), never a spawn that fails later.

import { createRequire } from "node:module";

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

export function resolveClaudeExecutable(): string | null {
  // THE WAIVER BELOW CANNOT BIND TODAY and its stale-waiver alarm is EXPECTED (#2477): `caught-failure-ownership`
  // declares `population: ["@packages", "@showcase", "@default-content", "@tooling"]` and `@packages` is the
  // explicit six-root list, so `packages/inference/src/**` is judged by that policy not at all. The marker stays
  // because it is SOUND — deleting it to silence the alarm would bless the coverage hole and lose this reason.
  // @orb-waive caught-failure-ownership(catch): a MODULE-RESOLUTION miss IS the answer — the wire is unbuilt (the
  // registry's `needs` predicate names it), not a failure to report. Ends if the SDK grows a second install shape.
  try {
    return createRequire(import.meta.url).resolve(SDK_PACKAGE);
  } catch {
    return null;
  }
}
