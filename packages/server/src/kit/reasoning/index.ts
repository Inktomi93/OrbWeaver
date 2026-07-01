// @orb/server/kit/reasoning — the inline `<think>` reasoning-tag parser (D47 #3 / D53 step 2). Pure,
// deterministic (no I/O, clock, random), server-only (0 client consumers — sibling to `server/kit/post-process`
// per core/Legacy-Migration-and-Gaps.md). Modeled on SillyTavern's `parseReasoningFromString`.
//
// NATIVE-FIRST (the gate is the CALLER's — engine/pipeline RECEIVE): native reasoning is already handled across
// every backend (vLLM `reasoning_content`, OpenRouter `reasoning`, agent-sdk `thinking`). This is the FALLBACK
// for models that emit reasoning inline as `<think>…</think>` in the content with NO native reasoning field. The
// caller runs it ONLY when the reduced reasoning channel is empty AND `PromptConfig.reasoningParse.autoParse` is
// on — so it never double-counts a native reasoning trace.
//
// node:vm is NOT needed: the prefix/suffix are HOST CONFIG (trusted), not an untrusted user regex — the only
// regex is built from the escaped config, so there is no ReDoS surface (unlike the user-authored regex engine).

import { escapeRegExp } from "@orb/kit/strings";

/** Options for {@link parseReasoningTags}. `prefix`/`suffix` are the literal open/close tags (host config —
 *  e.g. `<think>`/`</think>`); `strict` (default true) anchors the open tag at the START of the content
 *  (leading whitespace allowed) so a `<think>` buried mid-reply is NOT treated as a reasoning block. */
export interface ReasoningParseOptions {
  readonly prefix: string;
  readonly suffix: string;
  readonly strict?: boolean | undefined;
}

/** A successful split of a reply into its reasoning trace + the remaining visible content (both trimmed). */
export interface ParsedReasoning {
  readonly reasoning: string;
  readonly content: string;
}

const DEFAULT_STRICT = true;

/**
 * Split an inline `<think>…</think>`-style reasoning block out of `content`. Returns `{ reasoning, content }`
 * on a successful match (both halves trimmed), or `null` when there is NO match — a missing prefix OR suffix,
 * empty tags, or (strict) a prefix not at the start. On null the caller strips nothing (the content is left
 * exactly as the model produced it).
 *
 * The find regex is built ONCE per call from the ESCAPED config (so a tag like `[think]` matches literally),
 * with a non-greedy `(.*?)` body and the `s` (dotall) flag so a multi-line reasoning block is captured. Strict
 * mode prepends `^\s*?` (start-anchored, leading whitespace tolerated). Both tags are REQUIRED: a content with
 * an opening tag but no closing tag does not match (returns null) — we never strip a half-open block.
 */
export function parseReasoningTags(
  content: string,
  options: ReasoningParseOptions,
): ParsedReasoning | null {
  const { prefix, suffix } = options;
  if (prefix.length === 0 || suffix.length === 0) {
    return null;
  }
  const strict = options.strict ?? DEFAULT_STRICT;
  const anchor = strict ? "^\\s*?" : "";
  // `su`: dotall (the `(?<body>.*?)` capture spans newlines) + unicode. The pattern is config-derived (escaped),
  // not a literal — `useTopLevelRegex` targets literal regexes in hot paths; this builds once per RECEIVE. The
  // NAMED group sidesteps positional index access (`match[1]` reads as a never-undefined `string`, defeating the
  // `?? ""` fallback under noUncheckedIndexedAccess); `match.groups` is genuinely `| undefined`.
  const pattern = new RegExp(
    `${anchor}${escapeRegExp(prefix)}(?<body>.*?)${escapeRegExp(suffix)}`,
    "su",
  );
  const match = pattern.exec(content);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive — biome models `RegExp.exec` non-nullable, but it returns `RegExpExecArray | null` (no match → null), so the guard is real.
  if (match === null) {
    return null;
  }
  const reasoning = (match.groups?.["body"] ?? "").trim();
  // The visible content = the reply with the matched block (incl. the strict leading whitespace) removed. The
  // pattern is non-global, so `replace` strips exactly the ONE matched span; trimmed to drop edge whitespace.
  const rest = content.replace(pattern, "").trim();
  return { reasoning, content: rest };
}
