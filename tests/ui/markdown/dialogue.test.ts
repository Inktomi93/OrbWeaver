// The quoted-speech detector's grammar (the seal's `--color-dialogue` consumer). The whole value of this
// feature is that it NEVER mis-tints: a mis-colored half-paragraph is worse than no color at all, so the
// cases below pin the fail-plain boundaries (apostrophes, unclosed runs, mismatched delimiter pairs, a
// newline inside a run, code spans) as hard as the positive ones. Deep-imports src (browser package;
// @orb/ui is not node-resolvable), like policy.test.ts.

import { describe } from "vitest";
import type { DialoguePart } from "../../../packages/ui/src/markdown/dialogue.ts";
import { splitDialogue } from "../../../packages/ui/src/markdown/dialogue.ts";
import { expect, test } from "../../support/fixtures.ts";

const text = (value: string): DialoguePart => ({ text: value, atomic: false });
/** An element child that carries text (Streamdown's per-word streaming span) — tinted whole or not at all. */
const atom = (value: string): DialoguePart => ({ text: value, atomic: true });
/** An element child with no participating text (`<em>`, inline `<code>`, a link). */
const opaque: DialoguePart = { text: "", atomic: true };

/** The tinted runs of a one-string paragraph, in order. */
function quoted(...parts: readonly DialoguePart[]): string[] {
  return splitDialogue(parts)
    .flat()
    .filter((piece) => piece.quoted)
    .map((piece) => piece.text ?? "■"); // ■ = an atomic child tinted whole
}

/** The rendered text of a one-string paragraph, proving no character is dropped or duplicated. */
function rejoin(...parts: readonly DialoguePart[]): string {
  return splitDialogue(parts)
    .flat()
    .map((piece) => piece.text ?? "")
    .join("");
}

describe("straight + typographic runs", () => {
  test('a straight "…" run is tinted, delimiters included', () => {
    expect(quoted(text('She said "hello there" and left.'))).toEqual(['"hello there"']);
  });

  test("a typographic “…” run is tinted (the Azarael card's own delimiters)", () => {
    expect(quoted(text("He tilts his head. “You're late,” he says."))).toEqual(["“You're late,”"]);
  });

  test("both kinds in one paragraph each tint independently (ST prose mixes them)", () => {
    expect(quoted(text('“First,” then a beat, "second."'))).toEqual(["“First,”", '"second."']);
  });

  test("two straight runs pair as open/close, not as one greedy run", () => {
    expect(quoted(text('"one" between "two"'))).toEqual(['"one"', '"two"']);
  });

  test("every character survives the split (nothing dropped or duplicated)", () => {
    const source = 'He said "one" then "two" and stopped.';
    expect(rejoin(text(source))).toBe(source);
  });
});

describe("fail plain — the boundaries", () => {
  test("apostrophes and single quotes never open a run", () => {
    expect(quoted(text("don't, 'not speech', it's fine"))).toEqual([]);
  });

  test("an unclosed run stays plain (the close must be in the same paragraph)", () => {
    expect(quoted(text('She said "hello and never stopped'))).toEqual([]);
  });

  test("a mismatched pair stays plain (a “ is not closed by a straight quote)", () => {
    expect(quoted(text('“Hello there" she said'))).toEqual([]);
  });

  test("a closing delimiter with no opener stays plain", () => {
    expect(quoted(text("she said” loudly"))).toEqual([]);
  });

  test("a run may not cross a newline — a stray quote can't swallow the rest of the paragraph", () => {
    expect(quoted(text('"open here\nand closed way down there"'))).toEqual([]);
  });

  test("a newline BETWEEN two complete runs leaves both tinted", () => {
    expect(quoted(text('"one"\n"two"'))).toEqual(['"one"', '"two"']);
  });
});

describe("runs across inline children", () => {
  test("an opaque child (an <em> / inline <code>) inside a run is tinted whole", () => {
    expect(quoted(text('She said "hello '), opaque, text(' there" softly'))).toEqual(['"hello ', "■", ' there"']);
  });

  test("a quote INSIDE a code span cannot open a run — code contributes no delimiters", () => {
    // `"` typed inside inline code is opaque, so the surrounding prose stays plain.
    expect(quoted(text("run "), opaque, text(" then plain prose"))).toEqual([]);
  });

  test("the streaming per-word spans resolve a run mid-stream, each word tinted whole", () => {
    expect(quoted(atom('"Hello'), atom(" "), atom('there,"'), atom(" he"))).toEqual(["■", "■", "■"]);
  });

  test("a streaming run with no close yet stays plain (it tints when the closing word arrives)", () => {
    expect(quoted(atom('"Hello'), atom(" "), atom("there"))).toEqual([]);
  });
});
