// Repo-path CITATIONS for a relocation: full paths, renamed directory prefixes and opted-in short forms, in
// any text (docs, comments, strings, JSON ledgers). A citation is a whole path token: the character before
// it is not a name character and the one after does not extend the name.
import { posix } from "node:path";
import type { MoveMap } from "./relocate-map.ts";

/** A compiled citation rewriter for one move map. */
export interface CitationRewriter {
  readonly rewrite: (text: string) => string;
}

const NAME_BEFORE = String.raw`(?<![\w.@#-])`;
const NAME_AFTER = String.raw`(?![\w-])(?!\.\w)`;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/** Map a citation key (a path, with or without its file extension) to its new spelling. */
function citationKeys(moves: MoveMap): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  const add = (from: string, to: string): void => {
    keys.set(from, to);
    const ext = posix.extname(from);
    if (ext !== "" && posix.extname(to) === ext && !from.endsWith(".d.ts")) {
      keys.set(from.slice(0, -ext.length), to.slice(0, -ext.length));
    }
  };
  for (const [from, to] of moves.files) {
    add(from, to);
  }
  for (const [from, to] of moves.shortForms) {
    add(from, to);
  }
  for (const [from, to] of moves.dirRenames) {
    keys.set(from, to);
  }
  return keys;
}

/** Build the rewriter; longer keys win, so a file citation beats the directory prefix that holds it. */
export function citationRewriter(moves: MoveMap): CitationRewriter {
  const keys = citationKeys(moves);
  const dirPrefixes = moves.dirRenames.map(([from]) => from);
  const alternation = [...keys.keys()]
    .toSorted((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const dirAlternation = dirPrefixes
    .toSorted((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const exact = new RegExp(`${NAME_BEFORE}(${alternation})${NAME_AFTER}`, "gu");
  const prefix = dirAlternation === "" ? undefined : new RegExp(`${NAME_BEFORE}(${dirAlternation})/`, "gu");
  return {
    rewrite(text: string): string {
      const once = text.replace(exact, (match: string, key: string) => keys.get(key) ?? match);
      if (prefix === undefined) {
        return once;
      }
      return once.replace(prefix, (match: string, dir: string) => {
        const rename = moves.dirRenames.find(([from]) => from === dir);
        return rename === undefined ? match : `${rename[1]}/`;
      });
    },
  };
}

/** Apply literal replacements, longest first, each once over the text. */
export function applyLiterals(text: string, literals: readonly (readonly [string, string])[]): string {
  let out = text;
  for (const [from, to] of literals.toSorted((a, b) => b[0].length - a[0].length)) {
    out = out.replaceAll(from, to);
  }
  return out;
}
