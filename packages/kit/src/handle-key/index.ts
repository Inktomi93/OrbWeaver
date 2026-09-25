// The handle comparison key (D256): two handles with one key look alike, so they are one handle. Every
// `users.handle` writer compares on it and `users.handle_key` stores it; the handle a user sees is never folded.

import type { HandleKey } from "#ids";
import { castId } from "#ids";
import { CASE_FOLDING, CONFUSABLE_PROTOTYPES, DEFAULT_IGNORABLE, SCRIPT_CODES } from "./unicode-data.ts";

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

// One pass: NFKC, the skeleton of the upper-cased form, case fold, the skeleton again, case fold.
function keyPass(text: string, data: Tables): string {
  const capitals = skeleton(text.normalize("NFKC").toUpperCase(), data);
  return caseFold(skeleton(caseFold(capitals, data), data), data);
}

/**
 * The comparison key of a handle: two passes of NFKC, the confusable skeleton of the upper-cased form, case
 * fold, the skeleton again and case fold.
 *
 * @remarks
 * Plain NFKC-fold-skeleton misses a capital look-alike: folding turns Cyrillic `Н` (prototype `H`) into `н`
 * (prototype `ʜ`), so `Нost` and `host` would differ. The first skeleton sees capitals and the second sees
 * lowercase-only look-alikes such as `ɑ`; the folds between make the key case-insensitive. One pass is not
 * idempotent (`ɪ` reaches `i`, which the next pass takes to `l`), so the key is two passes, which is. The
 * skeleton is UTS 39 `internalSkeleton`, which equals `skeleton` for text with no right-to-left letters; a
 * handle that mixes directions compares in logical order, not display order. Keys are comparable only under
 * one Unicode version (`unicode-data.ts`).
 */
export function handleKey(handle: string): HandleKey {
  const data = loaded();
  return castId<HandleKey>(keyPass(keyPass(handle, data), data));
}

// UTS 39 section 5.1: Common and Inherited characters take any script, and Han, Hiragana, Katakana, Hangul and
// Bopomofo resolve to the writing systems they combine into.
const ANY_SCRIPT: ReadonlySet<string> = new Set(["Zyyy", "Zinh"]);
const UNASSIGNED = "Zzzz";
const WRITING_SYSTEMS: ReadonlyMap<string, readonly string[]> = new Map([
  ["Hani", ["Hanb", "Jpan", "Kore"]],
  ["Hira", ["Jpan"]],
  ["Kana", ["Jpan"]],
  ["Hang", ["Kore"]],
  ["Bopo", ["Hanb"]],
]);
// UTS 39 highly restrictive: Latin may also combine with one of these writing systems.
const LATIN = "Latn";
const LATIN_PARTNERS: readonly string[] = ["Jpan", "Kore", "Hanb"];

let scriptMatchers: readonly (readonly [string, RegExp])[] | undefined;
const scriptsByChar = new Map<string, ReadonlySet<string>>();

// A code point's Script_Extensions, augmented with the writing systems it resolves to, from the engine's
// Unicode data (the same version as `unicode-data.ts`).
function scriptsOf(char: string): ReadonlySet<string> {
  const known = scriptsByChar.get(char);
  if (known !== undefined) {
    return known;
  }
  scriptMatchers ??= SCRIPT_CODES.join(";")
    .split(";")
    .map((code) => [code, new RegExp(`^\\p{scx=${code}}$`, "u")] as const);
  const scripts = new Set<string>();
  for (const [code, matcher] of scriptMatchers) {
    if (matcher.test(char)) {
      scripts.add(code);
      for (const system of WRITING_SYSTEMS.get(code) ?? []) {
        scripts.add(system);
      }
    }
  }
  scriptsByChar.set(char, scripts);
  return scripts;
}

/**
 * Whether a handle may be written at all (D256), checked by every handle writer before its key: its NFKC
 * form meets the UTS 39 highly restrictive profile, one script, or Latin with Japanese, Korean or Chinese
 * writing; Common and Inherited characters (digits, punctuation, marks) fit any script, and an unassigned code
 * point never fits. A mixed-script handle can spell a look-alike the confusable data does not map.
 */
export function admitsHandle(handle: string): boolean {
  const scripted = [...handle.normalize("NFKC")].map(scriptsOf).filter((scripts) => ![...scripts].every((code) => ANY_SCRIPT.has(code)));
  if (scripted.some((scripts) => scripts.has(UNASSIGNED))) {
    return false;
  }
  const common = scripted.reduce<ReadonlySet<string> | null>(
    (acc, scripts) => (acc === null ? scripts : new Set([...acc].filter((code) => scripts.has(code)))),
    null,
  );
  if (common === null || common.size > 0) {
    return true;
  }
  const coveredBy = (allowed: ReadonlySet<string>): boolean => scripted.every((scripts) => [...scripts].some((code) => allowed.has(code)));
  return LATIN_PARTNERS.some((partner) => coveredBy(new Set([LATIN, partner])));
}
