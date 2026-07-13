// The inline `<think>` reasoning-tag parser. Pure, deterministic. Native reasoning is already handled
// across every backend; this is the fallback for models that emit reasoning inline with no native
// reasoning field — the caller runs it only when the reduced reasoning channel is empty and
// reasoningParse.autoParse is on, so it never double-counts a native trace.
//
// node:vm is not needed: the prefix/suffix are host config (trusted), not an untrusted user regex, so
// there is no ReDoS surface.

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
 * on a successful match (both halves trimmed), or `null` when there is no match. Both tags are required: an
 * opening tag with no closing tag does not match — we never strip a half-open block.
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
  const rest = content.replace(pattern, "").trim();
  return { reasoning, content: rest };
}
