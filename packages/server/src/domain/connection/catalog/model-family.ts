// domain/connection/catalog/model-family — family detection for the capability synthesis. Migrated from
// the previous codebase's `providers/_shared/model-family.ts`; `FAMILY_CAPS` is DISSOLVED into
// `resolve-model-capability.ts` (the ONE descriptor factory) — only the detector lives here.
//
// LOAD-BEARING — the anchors (providers.md Esoteric §7): the anthropic regex
// `/^(anthropic\/)?claude[-/]/i` matches BOTH bare (`claude-opus-4-8`) and prefixed
// (`anthropic/claude-opus-4-8`) ids BUT rejects third-party forks (`some-org/claude-fork` → `other`), so an
// alien backend whose id merely CONTAINS "claude" never receives Anthropic-only directives (cache_control).
// The `^` anchor + the `(anthropic\/)?` optional group are both required — drop either and a fork leaks in.

// The detectable families. A plain `as const` tuple (NOT a `z.enum`/`export type` — those are gated outside
// `contract/`); the `other` member is the catch-all. resolve-model-capability derives its caps key from
// this one tuple (no second family list).
export const MODEL_FAMILIES = ["anthropic", "openai", "google", "meta", "deepseek", "qwen", "mistral", "xai", "other"] as const;

// File-local (non-exported — no-inline-types only flags EXPORTED type homes outside contract/). The
// resolver re-derives the same union from MODEL_FAMILIES for its caps Record key.
type ModelFamily = (typeof MODEL_FAMILIES)[number];

// The anthropic anchor is load-bearing: prefixed and bare Claude ids belong to one family.
const ANTHROPIC_RE = /^(anthropic\/)?claude[-/]/i;
const OPENAI_RE = /^(openai\/)?(gpt-|o[13]|chatgpt|davinci)/i;
const GOOGLE_RE = /^(google\/)?gemini/i;
const META_RE = /^(meta-llama\/)?llama/i;
const DEEPSEEK_RE = /^deepseek\//i;
const QWEN_RE = /^qwen\//i;
const MISTRAL_RE = /^mistralai\//i;
const XAI_RE = /^(x-ai\/)?grok/i;

/**
 * Detect a model's family from its id (bare or provider-prefixed). The anthropic arm is anchored to reject
 * forks (file header). Order matters only for disjoint prefixes; each arm is independently anchored at `^`.
 */
export function detectModelFamily(id: string): ModelFamily {
  if (ANTHROPIC_RE.test(id)) {
    return "anthropic";
  }
  if (OPENAI_RE.test(id)) {
    return "openai";
  }
  if (GOOGLE_RE.test(id)) {
    return "google";
  }
  if (META_RE.test(id)) {
    return "meta";
  }
  if (DEEPSEEK_RE.test(id)) {
    return "deepseek";
  }
  if (QWEN_RE.test(id)) {
    return "qwen";
  }
  if (MISTRAL_RE.test(id)) {
    return "mistral";
  }
  if (XAI_RE.test(id)) {
    return "xai";
  }
  return "other";
}
