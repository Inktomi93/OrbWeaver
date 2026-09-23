// verb: toToolDefinitions — registry → the BACKEND-NEUTRAL tool definitions (D48, re-homed by
// D177). Pure projection over a resolved set: the JSON schema CACHED at
// registration as `parameters`, plus the zod raw shape it was projected from as `inputShape`; order = resolve
// order (deterministic — the request body is byte-stable for a given attachment list; the prompt cache cares).
// ONE projection for every wire: `@orb/inference` turns the same definitions into an array wire's `tools[]` or the
// Agent SDK's in-process MCP server, so this domain never learns which backend a turn rides.

import type { ChatToolDefinition } from "@orb/inference";
import type { ResolvedToolSet } from "../contract/results.ts";

export function createToToolDefinitions(): (set: ResolvedToolSet) => readonly ChatToolDefinition[] {
  return (set: ResolvedToolSet): readonly ChatToolDefinition[] =>
    set.entries.map((entry) => ({
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
      inputShape: entry.argShape,
    }));
}
