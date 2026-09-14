// Shared lexical reader for authored Tailwind class tokens. It owns only token boundaries and syntax;
// each policy keeps its own carrier fence, vocabulary, cardinality, and reporting rule.

const WHITESPACE_RE = /\s+/u;
const IMPORTANT_RE = /^!|!$/gu;

export interface TailwindClassToken {
  readonly token: string;
  /** Zero-based offset into the enclosing literal node, including its one-character opening delimiter. */
  readonly offset: number;
  readonly variants: readonly string[];
  /** Terminal utility exactly as authored, after variants but before the important modifier is removed. */
  readonly terminal: string;
  /** Terminal utility with Tailwind's supported leading or trailing important modifier removed. */
  readonly utility: string;
}

/** Split on top-level colons while preserving colons inside arbitrary variants and values. */
function splitTailwindClassToken(token: string): readonly string[] {
  const segments: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === "[" || character === "(") {
      depth += 1;
    } else if (character === "]" || character === ")") {
      depth -= 1;
    } else if (character === ":" && depth === 0) {
      segments.push(token.slice(start, index));
      start = index + 1;
    }
  }
  segments.push(token.slice(start));
  return segments;
}

/** Parse one whitespace-delimited token without applying any policy vocabulary. */
export function readTailwindClassToken(token: string, offset = 0): TailwindClassToken {
  const segments = splitTailwindClassToken(token);
  const terminal = segments.at(-1) ?? token;
  return { token, offset, variants: segments.slice(0, -1), terminal, utility: terminal.replace(IMPORTANT_RE, "") };
}

/** Read all tokens from a string/template literal part, retaining exact authored offsets for reports. */
export function readTailwindClassTokens(nodeText: string): readonly TailwindClassToken[] {
  // Template heads/middles close with the two-character substitution opener; tails and
  // ordinary literals close with one delimiter. Offsets remain relative to the authored node.
  const closingWidth = nodeText.endsWith("${") ? 2 : 1;
  const stripped = nodeText.slice(1, -closingWidth);
  const tokens: TailwindClassToken[] = [];
  let cursor = 0;
  for (const token of stripped.split(WHITESPACE_RE)) {
    const at = stripped.indexOf(token, cursor);
    cursor = at + token.length;
    if (token.length > 0) {
      tokens.push(readTailwindClassToken(token, at + 1));
    }
  }
  return tokens;
}
