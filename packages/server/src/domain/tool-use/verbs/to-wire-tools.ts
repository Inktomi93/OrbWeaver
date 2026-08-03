// verb: toWireTools — registry → the OpenAI-wire `tools[]` (tool-use-design/02 §2). Pure projection
// over a resolved set using the JSON schema CACHED at registration; order = resolve order
// (deterministic — the request body is byte-stable for a given attachment list; the prompt cache
// cares). The translators wrap these in their own dialect envelopes (`{type:"function",…}`) — this
// verb emits the neutral contract shape.

import type { WireTool } from "#infra/providers";
import type { ResolvedToolSet } from "../contract/results.ts";

export function createToWireTools(): (set: ResolvedToolSet) => readonly WireTool[] {
  return (set: ResolvedToolSet): readonly WireTool[] =>
    set.entries.map((entry) => ({
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
    }));
}
