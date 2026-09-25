// Curated capability rows — xai. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const xaiRows = [
  {
    match: {
      model: "^(x-ai/)?grok",
    },
    kind: "generation",
    generation: {
      reasoning: {
        mode: "none",
        enabled: false,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "resolve-model-capability.ts FAMILY_REASONING.xai (no reasoning by family; OR advertises the reasoning variants)",
    },
  },
  // The window is xAI's `maxPromptLength`, from the model data its docs pages render; each id list is that entry's
  // name plus its documented aliases.
  {
    match: {
      model: "^(x-ai/)?grok-(4\\.7|4\\.6|4\\.5|4\\.5-latest|build-latest)$",
    },
    generation: {
      context: {
        window: 500_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "docs.x.ai/developers/models/grok-4.7: 'Context window 500,000'; the same page's model data: grok-4.7, grok-4.6 and grok-4.5 (aliases grok-4.5-latest, grok-build-latest) maxPromptLength 500000",
    },
  },
  {
    match: {
      model: "^(x-ai/)?grok-4\\.(3(-latest)?|20(-[a-z0-9-]+)?)$",
    },
    generation: {
      context: {
        window: 1_000_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "docs.x.ai/developers/models/grok-4.7 model data: grok-4.3 (alias grok-4.3-latest), grok-4.20-0309-reasoning, grok-4.20-0309-non-reasoning and grok-4.20-multi-agent-0309 (every grok-4.20-* alias) maxPromptLength 1000000",
    },
  },
  {
    match: {
      model: "^(x-ai/)?grok-(build-0\\.1|code-fast|code-fast-1|code-fast-1-0825)$",
    },
    generation: {
      context: {
        window: 256_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "docs.x.ai/developers/models/grok-4.7 model data: grok-build-0.1 (aliases grok-code-fast-1, grok-code-fast, grok-code-fast-1-0825) maxPromptLength 256000",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
