// Config-read line lookup and glob selection shared by the static config reader and no-blanket-suppression.
import { matchesGlob } from "node:path";

/** Resolve repeated literal selector values to their successive authored lines. */
export function lineFinder(text: string): (path: string) => number {
  const lines = text.split(/\r?\n/u);
  const cursor = new Map<string, number>();
  return (path) => {
    const quoted = `"${path}"`;
    const from = cursor.get(quoted) ?? 0;
    const at = lines.findIndex((line, index) => index >= from && line.includes(quoted));
    if (at < 0) {
      return 0;
    }
    cursor.set(quoted, at + 1);
    return at + 1;
  };
}

/** Index of the first glob metacharacter — the end of the pattern's literal head. */
function headLength(pattern: string): number {
  const at = pattern.search(/[*?[\]{}!]/u);
  return at === -1 ? pattern.length : at;
}

/** A GLOB matcher over repo-relative members, using node's OWN `path.matchesGlob` — never a hand-rolled
 *  translator (a bespoke glob DSL is the lying-proof class: it passes its own fixtures and silently
 *  mis-answers the corpus). The second arm covers a DIRECTORY entry: `packages/db/src/schema` names a tree
 *  node, and every file under it is a member. */
export function globMatcher(pattern: string): (member: string) => boolean {
  // `matchesGlob` recompiles the pattern on EVERY call, so a bare per-member call over the whole corpus is
  // the dominant cost (measured: +3.9s on eslint's 78 globs alone). The literal head — everything before the
  // first metacharacter — is a SOUND necessary condition: every one of these syntaxes matches that prefix
  // verbatim, and a pattern that starts with a metacharacter yields "" and filters nothing. It only ever
  // skips members that could not have matched.
  const head = pattern.slice(0, headLength(pattern));
  return (member) => member.startsWith(head) && (matchesGlob(member, pattern) || matchesGlob(member, `${pattern}/**`));
}
