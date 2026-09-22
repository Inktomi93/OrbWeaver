// Family detection for the capability synthesis — one of the TWO homes a model-id regex may live in (the
// other is `sources/curated/loader.ts`; the `inference-model-regex-fence` gate reds any third). The anthropic
// anchor is LOAD-BEARING: `/^(anthropic\/)?claude[-/]/i` matches bare and prefixed Claude ids but rejects
// `some-org/claude-fork`, so an alien backend whose id merely contains "claude" never receives Anthropic-only
// directives (cache_control) or the Claude family floor.

import type { ModelFamily } from "../contract/runtime.ts";

const FAMILY_ANCHORS: readonly (readonly [Exclude<ModelFamily, "other">, RegExp])[] = [
  ["anthropic", /^(anthropic\/)?claude[-/]/i],
  ["openai", /^(openai\/)?(gpt-|o[13]|chatgpt|davinci)/i],
  ["google", /^(google\/)?gemini/i],
  ["meta", /^(meta-llama\/)?llama/i],
  ["deepseek", /^deepseek\//i],
  ["qwen", /^qwen\//i],
  ["mistral", /^mistralai\//i],
  ["xai", /^(x-ai\/)?grok/i],
];

/** Detect a model's family from its id (bare or provider-prefixed); each arm is independently `^`-anchored. */
export function detectModelFamily(id: string): ModelFamily {
  for (const [family, anchor] of FAMILY_ANCHORS) {
    if (anchor.test(id)) {
      return family;
    }
  }
  return "other";
}
