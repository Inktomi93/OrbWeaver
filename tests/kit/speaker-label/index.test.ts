import {
  cleanPerSpeakerReply,
  foreignLabelStops,
  includesWholeName,
  LEADING_SPEAKER_TAG,
  NAME_END_BOUNDARY,
  normalizeExampleStart,
  parseSpeakerSpans,
  resolveSegmentAnchor,
  segmentSnippet,
  speakerTagsToPlain,
  stripInlineSpeakerLabel,
  stripLeadingSpeakerName,
  stripSelfSpeakerLabel,
  truncateAtForeignLabel,
} from "@orb/kit/speaker-label";
import { expect, test } from "../../support/fixtures.ts";

// parseSpeakerSpans (§12.4): the `<speaker>NAME</speaker>` split feeding the client narrator renderer.
// Pins the load-bearing byte-identical no-op (zero markers => one null-speaker span carrying `content`
// untouched) plus the ordered multi-span shape a tagged/merged-narrator body produces. Promoted here
// from the client with the source (C16) so kit tweaking the grammar can't silently diverge the renderer.

test("parseSpeakerSpans: zero markers is the byte-identical no-op — one null-speaker span, text untouched", () => {
  const content = "Just plain **markdown** with no speaker tags.";
  expect(parseSpeakerSpans(content)).toEqual([{ speaker: null, text: content }]);
});

test("parseSpeakerSpans: empty content is also the no-op shape", () => {
  expect(parseSpeakerSpans("")).toEqual([{ speaker: null, text: "" }]);
});

test("parseSpeakerSpans: a single marker attributes everything after it to that speaker", () => {
  expect(parseSpeakerSpans("<speaker>Alice</speaker>Hello there!")).toEqual([{ speaker: "Alice", text: "Hello there!" }]);
});

test("parseSpeakerSpans: text before the first marker is a preceding null-speaker span (narrator preamble)", () => {
  expect(parseSpeakerSpans("The room falls silent.<speaker>Bob</speaker>Well then.")).toEqual([
    { speaker: null, text: "The room falls silent." },
    { speaker: "Bob", text: "Well then." },
  ]);
});

test("parseSpeakerSpans: multiple markers split into ordered per-speaker spans", () => {
  const content = "<speaker>Alice</speaker>Hi!<speaker>Bob</speaker>Hey Alice.";
  expect(parseSpeakerSpans(content)).toEqual([
    { speaker: "Alice", text: "Hi!" },
    { speaker: "Bob", text: "Hey Alice." },
  ]);
});

test("parseSpeakerSpans: attrs on the open tag are tolerated", () => {
  expect(parseSpeakerSpans('<speaker data-x="1">Alice</speaker>Hi!')).toEqual([{ speaker: "Alice", text: "Hi!" }]);
});

test("parseSpeakerSpans: an empty/blank speaker name normalizes to a null-speaker span", () => {
  expect(parseSpeakerSpans("<speaker>   </speaker>Narration text.")).toEqual([{ speaker: null, text: "Narration text." }]);
});

test("parseSpeakerSpans: a trailing marker with no following text yields an empty text span (no crash)", () => {
  expect(parseSpeakerSpans("<speaker>Alice</speaker>")).toEqual([{ speaker: "Alice", text: "" }]);
});

// ── The SECOND marker alphabet: plain `Name:` labels for the PRESENT characters (the tolerance layer) ─────
// The `<speaker>` format is instructed, not guaranteed — the shipped demo transcripts (generated live
// against a real model) attribute with plain line-start labels and carry zero markers, and every narrator
// row committed before the instruction existed has only the plain form. The grammar is timid by design.

const CHARACTERS = ["Charlotte", "JFC"];

test("parseSpeakerSpans: with no characterNames the plain-label grammar never fires (byte-identical no-op)", () => {
  const content = "JFC: Ship the boring version.";
  expect(parseSpeakerSpans(content)).toEqual([{ speaker: null, text: content }]);
});

test("parseSpeakerSpans: line-start character labels split into ordered spans, LABEL TEXT KEPT", () => {
  const content = "*a foreleg taps*\n\nJFC: Ship it.\n\nCharlotte: With one nuance.";
  expect(parseSpeakerSpans(content, CHARACTERS)).toEqual([
    { speaker: null, text: "*a foreleg taps*\n\n" },
    { speaker: "JFC", text: "JFC: Ship it.\n\n" },
    { speaker: "Charlotte", text: "Charlotte: With one nuance." },
  ]);
});

test("parseSpeakerSpans: a label at position 0 opens the first span (no empty preamble span)", () => {
  expect(parseSpeakerSpans("JFC: Ship it.", CHARACTERS)).toEqual([{ speaker: "JFC", text: "JFC: Ship it." }]);
});

test("parseSpeakerSpans: markdown emphasis around the name and/or colon is tolerated", () => {
  expect(parseSpeakerSpans("**JFC:** Ship it.", CHARACTERS)).toEqual([{ speaker: "JFC", text: "**JFC:** Ship it." }]);
  expect(parseSpeakerSpans("*Charlotte*: Hm.", CHARACTERS)).toEqual([{ speaker: "Charlotte", text: "*Charlotte*: Hm." }]);
});

test("parseSpeakerSpans: a MID-SENTENCE character name never splits — the label must open a line", () => {
  const content = "She turned to JFC: the man was gone.";
  expect(parseSpeakerSpans(content, CHARACTERS)).toEqual([{ speaker: null, text: content }]);
});

test("parseSpeakerSpans: a name outside the room never attributes", () => {
  const content = "Mallory: trust me.";
  expect(parseSpeakerSpans(content, CHARACTERS)).toEqual([{ speaker: null, text: content }]);
});

test("parseSpeakerSpans: a character label INSIDE a fenced code block is skipped (the fence stays whole)", () => {
  const content = "JFC: here.\n\n```python\n# JFC: a comment\nprint(1)\n```";
  expect(parseSpeakerSpans(content, CHARACTERS)).toEqual([{ speaker: "JFC", text: content }]);
});

test("parseSpeakerSpans: the LONGEST matching character name wins (no prefix shadowing)", () => {
  expect(parseSpeakerSpans("Anna Lee: hi", ["Anna", "Anna Lee"])).toEqual([{ speaker: "Anna Lee", text: "Anna Lee: hi" }]);
});

test("parseSpeakerSpans: blank character names are dropped (an empty roster is the no-op)", () => {
  const content = "JFC: Ship it.";
  expect(parseSpeakerSpans(content, ["", "   "])).toEqual([{ speaker: null, text: content }]);
});

test("parseSpeakerSpans: a TAGGED body ignores characterNames — the marker grammar is authoritative", () => {
  expect(parseSpeakerSpans("<speaker>Charlotte</speaker>JFC: quoting him.", CHARACTERS)).toEqual([{ speaker: "Charlotte", text: "JFC: quoting him." }]);
});

test("LEADING_SPEAKER_TAG matches a leading <speaker> open-tag case-insensitively", () => {
  expect(LEADING_SPEAKER_TAG.test("<speaker>hi")).toBe(true);
  expect(LEADING_SPEAKER_TAG.test("  <Speaker name='x'> hi")).toBe(true);
  expect(LEADING_SPEAKER_TAG.test("hi <speaker>")).toBe(false);
});

test("speakerTagsToPlain converts inline markers to `Name: ` attribution", () => {
  expect(speakerTagsToPlain("<speaker>Alice</speaker>Hello <speaker>Bob</speaker>Hi")).toBe("Alice: Hello Bob: Hi");
});

test("speakerTagsToPlain is a no-op on content with no markers", () => {
  expect(speakerTagsToPlain("just narration, no tags")).toBe("just narration, no tags");
});

test("speakerTagsToPlain drops an empty-name marker entirely", () => {
  expect(speakerTagsToPlain("<speaker></speaker>text")).toBe("text");
});

test("normalizeExampleStart prepends the sentinel only when absent (idempotent)", () => {
  const body = "dialogue";
  expect(normalizeExampleStart(body)).toBe(`<START>\n${body}`);
  expect(normalizeExampleStart("<START>\nx")).toBe("<START>\nx");
  // Leading whitespace before an existing sentinel is tolerated → unchanged.
  expect(normalizeExampleStart("  <START> y")).toBe("  <START> y");
});

test("stripLeadingSpeakerName removes the own label, including markdown variants", () => {
  expect(stripLeadingSpeakerName("Alice: hello", "Alice")).toBe("hello");
  expect(stripLeadingSpeakerName("**Alice:** hi", "Alice")).toBe("hi");
  expect(stripLeadingSpeakerName("*Alice*: yo", "Alice")).toBe("yo");
});

test("stripLeadingSpeakerName preserves a content italic after the label (backref)", () => {
  expect(stripLeadingSpeakerName("Alice: *waves*", "Alice")).toBe("*waves*");
});

test("stripLeadingSpeakerName collapses a doubled label fully", () => {
  expect(stripLeadingSpeakerName("Bob: Bob: text", "Bob")).toBe("text");
});

test("stripLeadingSpeakerName leaves a foreign name, an empty name, and tags alone", () => {
  expect(stripLeadingSpeakerName("Carol: hi", "Dave")).toBe("Carol: hi");
  expect(stripLeadingSpeakerName("Alice: hi", "")).toBe("Alice: hi");
  // Name-only strip must not eat a leading <speaker> tag (the narrator parser needs it).
  expect(stripLeadingSpeakerName("<speaker>Alice: hi", "Alice")).toBe("<speaker>Alice: hi");
});

test("stripLeadingSpeakerName escapes regex metacharacters in the name (a period doesn't wildcard)", () => {
  expect(stripLeadingSpeakerName("Dr. X: hello", "Dr. X")).toBe("hello");
  // Without escaping, "Dr. X" as a regex would also match "DrY X" — it must not.
  expect(stripLeadingSpeakerName("DrY X: hello", "Dr. X")).toBe("DrY X: hello");
});

test("stripSelfSpeakerLabel strips interleaved leading tags and labels", () => {
  expect(stripSelfSpeakerLabel("<speaker>Alice: hi", "Alice")).toBe("hi");
  expect(stripSelfSpeakerLabel("<speaker>Alice: <speaker>Alice: hey", "Alice")).toBe("hey");
  expect(stripSelfSpeakerLabel("already clean", "Alice")).toBe("already clean");
});

test("truncateAtForeignLabel cuts at the first foreign label at a line start", () => {
  expect(truncateAtForeignLabel("I speak.\nNiko: hello", ["Niko"])).toBe("I speak.");
});

test("truncateAtForeignLabel ignores an in-prose colon and an empty roster", () => {
  expect(truncateAtForeignLabel("Well Niko: is here", ["Niko"])).toBe("Well Niko: is here");
  expect(truncateAtForeignLabel("x\nNiko: y", [])).toBe("x\nNiko: y");
});

test("truncateAtForeignLabel cuts at the EARLIEST of several foreign labels", () => {
  expect(truncateAtForeignLabel("mine\nZara: a\nNiko: b", ["Niko", "Zara"])).toBe("mine");
});

test("cleanPerSpeakerReply strips own label then truncates foreign drift", () => {
  expect(cleanPerSpeakerReply("Alice: hi\nBob: yo", "Alice", ["Bob"])).toBe("hi");
  // Solo (no other names): just the leading strip.
  expect(cleanPerSpeakerReply("Alice: solo line", "Alice", [])).toBe("solo line");
});

// P1 canon-corruption regression: the model, trained on the `Name:`-prefixed transcript in a speakerTags
// group turn, interleaves its OWN tag MID-generation. The `dumJFC: —b` word-splice observed in fixture
// message_01kyctjmg6e4e88m0vg5dwr8cd (seq 5): the model spat `JFC: —` at a token boundary between `dum`
// and `b`. The `^`-anchored leading/foreign strips can't reach a mid-content self-label — before the fix
// the fragment persisted into canon. RED on old code (stripInlineSpeakerLabel didn't exist).
test("stripInlineSpeakerLabel removes a mid-word self-tag splice (the dumJFC case)", () => {
  expect(stripInlineSpeakerLabel("ship the dumJFC: —b version by Friday", "JFC")).toBe("ship the dumb version by Friday");
});

test("stripInlineSpeakerLabel scrubs every inline self-label but leaves foreign names and prose colons", () => {
  expect(stripInlineSpeakerLabel("one JFC: two JFC: three", "JFC")).toBe("one two three");
  // A different speaker's inline label is left alone (foreign-drift truncation owns that case).
  expect(stripInlineSpeakerLabel("mine Mara: hers", "JFC")).toBe("mine Mara: hers");
  // Empty name is a no-op.
  expect(stripInlineSpeakerLabel("JFC: text", "")).toBe("JFC: text");
});

// #1354 — fence state used to count raw ``` OCCURRENCES, so ONE inline triple-backtick in prose suppressed
// every speaker label after it (fail-open for label suppression: a real `Tom:` line stopped splitting).
test("parseSpeakerSpans: a stray INLINE triple-backtick is not a fence and does not suppress later labels", () => {
  const body = "Check this out ``` neat trick.\nTom: hi there, how are you?";
  expect(parseSpeakerSpans(body, ["Tom"]).map((span) => span.speaker)).toEqual([null, "Tom"]);
});

test("parseSpeakerSpans: a real LINE-ANCHORED fence still protects a label inside it, and an unclosed fence runs to the end", () => {
  const fenced = "intro\n```\nTom: printf()\n```\nTom: after the block";
  expect(parseSpeakerSpans(fenced, ["Tom"]).map((span) => span.speaker)).toEqual([null, "Tom"]);
  // Up to three leading spaces is still a fence (CommonMark); unterminated ⇒ everything after is code.
  const unclosed = "intro\n   ```\nTom: inside an unterminated block";
  expect(parseSpeakerSpans(unclosed, ["Tom"]).map((span) => span.speaker)).toEqual([null]);
});

test("stripInlineSpeakerLabel tolerates markdown-wrapped and dash-opener variants", () => {
  expect(stripInlineSpeakerLabel("dum**JFC:**b", "JFC")).toBe("dumb");
  expect(stripInlineSpeakerLabel("a JFC:— b", "JFC")).toBe("a b");
});

test("stripInlineSpeakerLabel keeps a word separator on a space-delimited inline label", () => {
  expect(stripInlineSpeakerLabel("one JFC: two", "JFC")).toBe("one two");
});

// #1354 — the inline stripper had no LEFT boundary, so a character name that is a SUFFIX of an ordinary word was
// deleted out of the middle of it. This runs on every per-speaker reply BEFORE persist, so the altered bytes
// are what canon keeps.
test("stripInlineSpeakerLabel does NOT eat a character name out of the middle of an ordinary word", () => {
  expect(stripInlineSpeakerLabel("I told SusAnn: watch out.", "Ann")).toBe("I told SusAnn: watch out.");
  expect(stripInlineSpeakerLabel("the QUOTA: figure", "Ota")).toBe("the QUOTA: figure");
  // Non-ASCII names too — the boundary is `\p{L}\p{N}\p{M}`, not the ASCII-only `\b`.
  expect(stripInlineSpeakerLabel("книгаМария: тут", "Мария")).toBe("книгаМария: тут");
});

// #1530 — the two residues of the boundary fix. A DECOMPOSED letter ends the word for a `\p{L}\p{N}` test
// (the combining mark is neither), and an ASCII hyphen after the colon is ordinary prose, not the measured
// `Name: —` turn-opener the mid-word arm exists for.
test("stripInlineSpeakerLabel: a COMBINING MARK does not end the word, and a plain hyphen is not the turn-opener dash", () => {
  // "caféAnn" written decomposed: cafe + U+0301 + Ann — the mark sits immediately before the name.
  expect(stripInlineSpeakerLabel("I told cafe\u0301Ann: watch out.", "Ann")).toBe("I told cafe\u0301Ann: watch out.");
  expect(stripInlineSpeakerLabel("I told SusAnn: -bring it", "Ann")).toBe("I told SusAnn: -bring it");
  // The em/en dash still fires mid-word, and the hyphen still goes at a real boundary (arm A is unchanged).
  expect(stripInlineSpeakerLabel("dumAnn: –b", "Ann")).toBe("dumb");
  expect(stripInlineSpeakerLabel("a Ann:- b", "Ann")).toBe("a b");
});

// The other half of the same boundary decision: the torn-tag garbage this stripper exists for must STILL be
// removed mid-word. Narrowing that far would trade one corruption for another.
test("stripInlineSpeakerLabel still removes a mid-word torn label carrying markdown or the turn-opener dash", () => {
  expect(stripInlineSpeakerLabel("dumJFC: —b", "JFC")).toBe("dumb");
  expect(stripInlineSpeakerLabel("dum**JFC:**b", "JFC")).toBe("dumb");
  expect(stripInlineSpeakerLabel("start JFC: mid JFC: —end", "JFC")).toBe("start mid end");
});

// The finalized canon-purity guarantee: cleanPerSpeakerReply (the persist-path entry point) must never
// leave ANY self-tag fragment — leading, inline, or foreign-drift — in the stored body. This is the exact
// shape the corrupted fixture row should have persisted. RED on old code (mid-word fragment survived).
test("cleanPerSpeakerReply persists NO self-tag fragment — leading + inline + foreign all scrubbed", () => {
  const raw = "JFC: My whole religion fits on an index card: ship the dumJFC: —b version.\nMara: her line";
  expect(cleanPerSpeakerReply(raw, "JFC", ["Mara", "Niko"])).toBe("My whole religion fits on an index card: ship the dumb version.");
});

// foreignLabelStops (IMP-1) — the WIRE half of the same foreign-label grammar truncateAtForeignLabel
// enforces at RECEIVE. The pin that matters: the two ends agree, so a stop that fires and a truncate that
// fires cut the SAME text (the impersonate anti-bleed layer is only sound if they can't drift).
test("foreignLabelStops emits one `\\nName:` stop per name, deduped, blanks dropped", () => {
  expect(foreignLabelStops(["Seren", "Holt"])).toEqual(["\nSeren:", "\nHolt:"]);
  expect(foreignLabelStops(["Seren", " Seren ", "", "   "])).toEqual(["\nSeren:"]);
  // No character names (a chat with no characters) ⇒ no stops ⇒ a byte-identical request.
  expect(foreignLabelStops([])).toEqual([]);
});

test("foreignLabelStops agrees with truncateAtForeignLabel — the wire cut and the receive cut are the same cut", () => {
  const drafted = "I drop the satchel by the fire.\nSeren: She writes it down.";
  const stop = foreignLabelStops(["Seren"])[0] ?? "";
  // What a completion runner keeps when the stop fires == what the receive-side truncate keeps.
  expect(drafted.slice(0, drafted.indexOf(stop))).toBe(truncateAtForeignLabel(drafted, ["Seren"]));
});

// ── B7: the segment-anchor pair (`segmentSnippet` + `resolveSegmentAnchor`) — the ONE staleness rule
// every reaction consumer shares (the server's write validation + attribution read, the client display).
// The anchoring fitness suite proved WHY the trio exists (a bare index is not edit-stable; (index,
// speaker) is defeated by a same-speaker insert); these pins prove the rule ITSELF: each leg of the
// validity conjunction refuses alone, and the prefix arm is what keeps a tail edit alive.

test("segmentSnippet: trimmed head, caller-capped — the one derivation writers and validators share", () => {
  expect(segmentSnippet("  Bob: Fine day.  ", 120)).toBe("Bob: Fine day.");
  expect(segmentSnippet("abcdefgh", 4)).toBe("abcd");
  expect(segmentSnippet("   \n  ", 120)).toBe("");
});

const ANCHOR_BODY = "Alice: Hello there.\nBob: Fine day.";
const ANCHOR_CHARACTERS = ["Alice", "Bob"];

test("resolveSegmentAnchor: a live anchor resolves to its span; each stale leg refuses alone", () => {
  const live = resolveSegmentAnchor(ANCHOR_BODY, ANCHOR_CHARACTERS, { index: 1, speaker: "Bob", snippet: "Bob: Fine day." });
  expect(live).toEqual({ speaker: "Bob", text: "Bob: Fine day." });
  // Out of range — the body segments into two spans.
  expect(resolveSegmentAnchor(ANCHOR_BODY, ANCHOR_CHARACTERS, { index: 5, speaker: "Bob", snippet: "Bob: Fine day." })).toBeNull();
  // Speaker moved — a structural insert shifted the index onto somebody else's line.
  expect(resolveSegmentAnchor(ANCHOR_BODY, ANCHOR_CHARACTERS, { index: 0, speaker: "Bob", snippet: "Bob: Fine day." })).toBeNull();
  // The FINGERPRINT leg — the same-speaker-insert hole the suite found: index in range, speaker matches,
  // but the text is a DIFFERENT line by the same speaker. (index, speaker) alone would silently pass this.
  expect(resolveSegmentAnchor(ANCHOR_BODY, ANCHOR_CHARACTERS, { index: 1, speaker: "Bob", snippet: "Bob: Another line entirely." })).toBeNull();
});

test("resolveSegmentAnchor: the snippet is a PREFIX, so a tail edit keeps the anchor alive", () => {
  const edited = "Alice: Hello there.\nBob: Fine day. And a fine evening too.";
  const kept = resolveSegmentAnchor(edited, ANCHOR_CHARACTERS, { index: 1, speaker: "Bob", snippet: "Bob: Fine day." });
  expect(kept?.speaker).toBe("Bob");
  // A narration anchor carries `speaker: null` and resolves the same way.
  const narration = resolveSegmentAnchor("The rain fell.\n<speaker>Alice</speaker>Well.", [], { index: 0, speaker: null, snippet: "The rain fell." });
  expect(narration?.speaker).toBeNull();
});

// ── the shared name boundary (#1439) — the ONE class both server matchers borrow ──────────────────────

test("includesWholeName bounds on the UNICODE letter/number class, in both directions", () => {
  // ASCII behaviour is unchanged (the property class is a superset of `[a-z0-9]`).
  expect(includesWholeName("ari waits", "ari")).toBe(true);
  expect(includesWholeName("arianna waits", "ari")).toBe(false);
  // Cyrillic / CJK: a whole-word hit at ordinary separators…
  expect(includesWholeName("аня открыла дверь", "аня")).toBe(true);
  expect(includesWholeName("結衣 が入ってきた", "結衣")).toBe(true);
  expect(includesWholeName("аня, стой", "аня")).toBe(true);
  // …and NOT inside a longer Unicode word (the `[a-z0-9]` test called both neighbours separators).
  expect(includesWholeName("анятолия смотрит", "аня")).toBe(false);
  expect(includesWholeName("結衣子", "結衣")).toBe(false);
  // String edges are boundaries; an empty needle is never a name.
  expect(includesWholeName("аня", "аня")).toBe(true);
  expect(includesWholeName("anything", "")).toBe(false);
});

test("NAME_END_BOUNDARY is a lookahead that a built pattern can embed (the `\\b` it replaces was ASCII-only)", () => {
  const re = (name: string): RegExp => new RegExp(`@${name}${NAME_END_BOUNDARY}`, "giu");
  expect(re("Аня").test("@Аня открыла")).toBe(true);
  expect(re("Nova🌙").test("@Nova🌙 waves")).toBe(true);
  expect(re("Аня").test("@Анятолия смотрит")).toBe(false);
  // The control: the same assertions under `\b` are exactly the reported miss.
  expect(new RegExp("@Аня\\b", "giu").test("@Аня открыла")).toBe(false);
});
