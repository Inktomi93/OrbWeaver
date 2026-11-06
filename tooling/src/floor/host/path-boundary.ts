// Whole-segment path matching for ownership checks over a process's argv or cwd.
// A string prefix or suffix of a path is not that path: a match must sit on a boundary at both ends.
const SEPARATOR = String.raw`[\\/]`;
const ANCHORED = /^(?:[\\/]|[A-Za-z]:)/u;
// An anchored path starts at the text start or after whitespace or an argument delimiter. Any other character
// before it means a longer path ends here, such as a mirror or backup prefix.
const BEFORE_ANCHORED = String.raw`(?<![^\s=:,;"'])`;
// A relative fragment such as `.cache/snap-stage` may also follow a separator, never a name character.
const BEFORE_RELATIVE = String.raw`(?<![^\s=:,;"'\\/])`;
const AFTER_PATH = String.raw`(?![^\s\\/])`;

/** Start indexes where `path` occurs as whole segments in `text`; `/` and `\` match each other. */
export function pathOccurrences(text: string, path: string): readonly number[] {
  const body = path
    .split(/[\\/]/u)
    .map((segment) => RegExp.escape(segment))
    .join(SEPARATOR);
  const before = ANCHORED.test(path) ? BEFORE_ANCHORED : BEFORE_RELATIVE;
  return [...text.matchAll(new RegExp(`${before}${body}${AFTER_PATH}`, "gu"))].map((match) => match.index);
}
