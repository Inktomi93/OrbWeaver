// Who a line of text addresses by name. Pure word rules over a structural candidate, so the roster type, the
// eligibility check and the speaker identity stay with the caller: a candidate carries its id, display name and
// whether it may be addressed now.

import type { CharacterId } from "#ids";
import { UNICODE_WORD_CHARS } from "#strings";

/** A character a line can address: the caller maps its roster and decides `eligible` (present and not muted). */
export interface AddressCandidate {
  readonly id: CharacterId;
  readonly name: string;
  readonly eligible: boolean;
}

/** One canon line as the address rules read it: the text and the character who wrote it (null for a human). */
export interface AddressLine {
  readonly text: string;
  readonly characterId: CharacterId | null;
}

/** One character a text names, with how firmly: `hits` counts the distinct name words the text carries (the
 *  whole phrase for a name of only stopwords), and `strong` says a hit was written as a name rather than as an
 *  ordinary word. A text word spelled with a capital is a name; a lowercase one is, only when the card spells
 *  that name word lowercase too. So "Will, come here" is strong and "we will find it" is not. */
export interface NameMention {
  readonly id: CharacterId;
  readonly hits: number;
  readonly strong: boolean;
}

/** What a canon line addresses: the ordered groups of characters it names (a group of several is one ambiguous
 *  name), and whether any name in it could be a human player's as well as a character's. */
export interface LineAddress {
  readonly groups: readonly (readonly CharacterId[])[];
  readonly humanAmbiguous: boolean;
}

/** One word: a run of the shared Unicode word class, so `Аня` and `Chloé` split the way `Bran` does. Splitting
 *  needs a separator: in unspaced text (Japanese, Chinese) a name glued to the next word, as in `結衣さん`, is one
 *  longer word and does not name `結衣`. */
const WORD = new RegExp(`[${UNICODE_WORD_CHARS}]+`, "gu");

// NFC first, so a decomposed `Chloé` (e + combining accent) and a composed one are the same word.
function rawWordsOf(text: string): string[] {
  return text.normalize("NFC").match(WORD) ?? [];
}

function startsUpper(word: string): boolean {
  const first = Array.from(word)[0] ?? "";
  return first !== first.toLowerCase();
}

/** Name words that never name a character on their own. Nearly every message contains them, so a name like
 *  "The Knight" or "Lady of the Lake" would otherwise answer every message. Lowercase, compared per word. */
const NAME_STOPWORDS = [
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "from",
  "with",
  "by",
  "as",
  "is",
  "it",
  "i",
  "me",
  "my",
  "you",
  "your",
  "we",
  "our",
  "he",
  "his",
  "she",
  "her",
  "they",
  "their",
  "its",
] as const;

// A one-letter name word never names on its own either: an apostrophe splits `T'Pol` into `t` + `pol` and
// `don't` into `don` + `t`, so `t` would make every "don't" name T'Pol.
function isNonNaming(word: string): boolean {
  return Array.from(word).length === 1 || NAME_STOPWORDS.some((s) => s === word);
}

/** Where `seq` first occurs as consecutive words of `words`, or -1. */
function phraseAt(words: readonly string[], seq: readonly string[]): number {
  if (seq.length === 0) {
    return -1;
  }
  return words.findIndex((_, start) => seq.every((w, k) => words[start + k] === w));
}

/** Every start index where `seq` occurs as consecutive words of `words`. */
function phraseStarts(words: readonly string[], seq: readonly string[]): number[] {
  if (seq.length === 0) {
    return [];
  }
  return words.flatMap((_, start) => (seq.every((w, k) => words[start + k] === w) ? [start] : []));
}

// A text word is written as a name when it is capitalized, or when the card spells that name word lowercase too:
// "Will, come here" names Will, "we will find it" does not.
function writtenAsName(textWord: string, cardWord: string | undefined): boolean {
  return startsUpper(textWord) || (cardWord !== undefined && !startsUpper(cardWord));
}

/** A {@link NameMention} with the text word indices it was named at (`words`, the ones written as a name). */
interface MentionHit extends NameMention {
  readonly words: readonly number[];
}

/** The mention read over pre-split words, skipping the word indices in `ignore`. */
function mentionHits(rawText: readonly string[], candidates: readonly AddressCandidate[], ignore: ReadonlySet<number>): MentionHit[] {
  const text = rawText.map((w, i) => (ignore.has(i) ? "" : w.toLowerCase()));
  const found = candidates.flatMap((c, rosterIdx) => {
    const rawName = rawWordsOf(c.name);
    const nameWords = rawName.map((w) => w.toLowerCase());
    const keys = new Set(nameWords.filter((w) => !isNonNaming(w)));
    const at = keys.size > 0 ? text.findIndex((w) => keys.has(w)) : phraseAt(text, nameWords);
    if (at === -1) {
      return [];
    }
    const hitIdx = text.flatMap((w, i) => (keys.has(w) ? [i] : []));
    const written = keys.size > 0 ? hitIdx : [at];
    // A word counts toward `hits` only when it is written as a name, so an ordinary lowercase "hook" cannot
    // break a tie between characters the text addresses by another word.
    const asName = written.filter((i) => writtenAsName(rawText[i] ?? "", rawName[nameWords.indexOf(text[i] ?? "")]));
    const strong = asName.length > 0;
    const phraseHits = strong ? nameWords.length : 0;
    const hits = keys.size > 0 ? new Set(asName.map((i) => text[i])).size : phraseHits;
    const words = keys.size > 0 ? asName : nameWords.map((_, k) => at + k);
    return [{ id: c.id, at, rosterIdx, hits, strong, words }];
  });
  return found.sort((a, b) => a.at - b.at || a.rosterIdx - b.rosterIdx).map(({ id, hits, strong, words }) => ({ id, hits, strong, words }));
}

/**
 * Characters a text names. A character is named when any word of the text equals a non-stopword word of their
 * display name, case-insensitive, so "Aria" and "stormborn" both name `Aria Stormborn`, "knight" names `The Knight`
 * and "the" does not, and one word shared by two names names both. One-letter words never name, so "I don't" does
 * not name `T'Pol`. A name made only of stopwords and one-letter words is named by its whole name as a phrase.
 * Ordered by where each is first named, then roster order. Eligibility is not read here.
 */
export function nameMentionsOf(text: string, candidates: readonly AddressCandidate[]): NameMention[] {
  return mentionHits(rawWordsOf(text), candidates, new Set()).map(({ id, hits, strong }) => ({ id, hits, strong }));
}

/** The word indices of `text` a human player's name occupies, outside any character's whole name spelled out
 *  there. "Rook, your move." to the player Rook is an address to the human; "Rook the Bard" is the character. A
 *  whole name made only of a human's words ("Grace" for the player Grace, "Bran" for the player Bran Stark) could
 *  be either, so it shields nothing, and when it is written as a name outside a longer whole name the picker
 *  decides; "move with grace" is an ordinary word and no address at all. */
function humanWordIndices(
  rawText: readonly string[],
  candidates: readonly AddressCandidate[],
  humanNames: readonly string[],
): { readonly indices: Set<number>; readonly ambiguous: boolean } {
  const text = rawText.map((w) => w.toLowerCase());
  const human = new Set(humanNames.flatMap((n) => rawWordsOf(n).map((w) => w.toLowerCase())).filter((w) => !isNonNaming(w)));
  const names = candidates.map((c) => {
    const rawName = rawWordsOf(c.name);
    const nameWords = rawName.map((w) => w.toLowerCase());
    return { rawName, nameWords, humanOnly: nameWords.length > 0 && nameWords.every((w) => human.has(w)) };
  });
  // Every spelled-out whole name that is not purely a human's claims its words first, so "Rook the Bard" addresses
  // the Bard even beside a character named just "Rook" and a player named Rook.
  const characterSpans = new Set<number>();
  for (const { nameWords } of names.filter((n) => !n.humanOnly)) {
    for (const start of phraseStarts(text, nameWords)) {
      for (let k = 0; k < nameWords.length; k += 1) {
        characterSpans.add(start + k);
      }
    }
  }
  const ambiguous = names
    .filter((n) => n.humanOnly)
    .some(({ rawName, nameWords }) =>
      phraseStarts(text, nameWords).some(
        (start) => rawName.some((w, k) => writtenAsName(rawText[start + k] ?? "", w)) && nameWords.some((_, k) => !characterSpans.has(start + k)),
      ),
    );
  return { indices: new Set(text.flatMap((w, i) => (human.has(w) && !characterSpans.has(i) ? [i] : []))), ambiguous };
}

/**
 * Who a canon line addresses by name: the eligible characters it names as a name (a {@link NameMention} that is
 * `strong`), whoever wrote it, as ordered groups. Characters named by overlapping words compete for one address:
 * the most fully named win the group ("The Black Knight" over "The Knight"), and a tie is an ambiguous group the
 * caller settles. A word a human player's name occupies addresses the human, not a character; a whole character
 * name that is also a human's ("Grace" for the player Grace) marks the line `humanAmbiguous`. An ineligible
 * character is dropped, and a speaker naming itself is no address.
 */
export function addressedGroups(line: AddressLine, candidates: readonly AddressCandidate[], humanNames: readonly string[]): LineAddress {
  const rawText = rawWordsOf(line.text);
  const named = candidates.filter((c) => c.id !== line.characterId && c.eligible);
  const human = humanWordIndices(rawText, named, humanNames);
  const hits = mentionHits(rawText, named, human.indices).filter((m) => m.strong);
  const groups: MentionHit[][] = [];
  for (const hit of hits) {
    const overlapping = groups.find((g) => g.some((other) => other.words.some((w) => hit.words.includes(w))));
    if (overlapping === undefined) {
      groups.push([hit]);
    } else {
      overlapping.push(hit);
    }
  }
  return {
    groups: groups.map((group) => {
      const best = Math.max(...group.map((m) => m.hits));
      return group.filter((m) => m.hits === best).map((m) => m.id);
    }),
    humanAmbiguous: human.ambiguous,
  };
}
