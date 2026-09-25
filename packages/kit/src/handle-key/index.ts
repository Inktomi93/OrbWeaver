// The handle comparison key (ADR 0254): two handles with one key look alike, so they are one handle. Every
// `users.handle` writer compares on it and `users.handle_key` stores it; the handle a user sees is never folded.

import type { HandleKey } from "#ids";
import { castId } from "#ids";
import { CASE_FOLDING, CONFUSABLE_PROTOTYPES, DEFAULT_IGNORABLE } from "./unicode-data.ts";

const HEX_RADIX = 16;

interface Tables {
  readonly fold: ReadonlyMap<string, string>;
  readonly prototype: ReadonlyMap<string, string>;
  readonly ignorable: readonly (readonly [number, number])[];
}

let tables: Tables | undefined;

function codePoints(hexes: string): string {
  return String.fromCodePoint(...hexes.split(" ").map((hex) => Number.parseInt(hex, HEX_RADIX)));
}

function mapping(lines: readonly string[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const entry of lines.join(";").split(";")) {
    const [source = "", target = ""] = entry.split(">");
    out.set(codePoints(source), codePoints(target));
  }
  return out;
}

function loaded(): Tables {
  tables ??= {
    fold: mapping(CASE_FOLDING),
    prototype: mapping(CONFUSABLE_PROTOTYPES),
    ignorable: DEFAULT_IGNORABLE.join(";")
      .split(";")
      .map((range) => {
        const [first = "", last = first] = range.split("-");
        return [Number.parseInt(first, HEX_RADIX), Number.parseInt(last, HEX_RADIX)] as const;
      }),
  };
  return tables;
}

// Unicode full case folding (CaseFolding.txt statuses C and F).
function caseFold(text: string, { fold }: Tables): string {
  let out = "";
  for (const char of text) {
    out += fold.get(char) ?? char;
  }
  return out;
}

// UTS 39 internalSkeleton: NFD, drop default-ignorables, map each code point to its prototype, NFD again.
function skeleton(text: string, { prototype, ignorable }: Tables): string {
  let out = "";
  for (const char of text.normalize("NFD")) {
    const cp = char.codePointAt(0) ?? 0;
    if (!ignorable.some(([first, last]) => cp >= first && cp <= last)) {
      out += prototype.get(char) ?? char;
    }
  }
  return out.normalize("NFD");
}

/**
 * The comparison key of a handle: NFKC, then the confusable skeleton of the upper-cased form, then case fold,
 * then the skeleton again, then case fold.
 *
 * @remarks
 * Plain NFKC-fold-skeleton misses a capital look-alike: folding turns Cyrillic `Н` (prototype `H`) into `н`
 * (prototype `ʜ`), so `Нost` and `host` would differ. The first skeleton sees capitals and the second sees
 * lowercase-only look-alikes such as `ɑ`; the folds between make the key case-insensitive. The skeleton is
 * UTS 39 `internalSkeleton`, which equals `skeleton` for text with no right-to-left letters; a handle that
 * mixes directions compares in logical order, not display order. Keys are comparable only under one Unicode
 * version (`unicode-data.ts`).
 */
export function handleKey(handle: string): HandleKey {
  const data = loaded();
  const capitals = skeleton(handle.normalize("NFKC").toUpperCase(), data);
  return castId<HandleKey>(caseFold(skeleton(caseFold(capitals, data), data), data));
}
