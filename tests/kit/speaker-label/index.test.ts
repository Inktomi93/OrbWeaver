import {
  cleanPerSpeakerReply,
  LEADING_SPEAKER_TAG,
  normalizeExampleStart,
  parseSpeakerSpans,
  speakerTagsToPlain,
  stripInlineSpeakerLabel,
  stripLeadingSpeakerName,
  stripSelfSpeakerLabel,
  truncateAtForeignLabel,
} from "@orb/kit/speaker-label";
import { expect, test } from "../../support/fixtures";

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

test("stripInlineSpeakerLabel tolerates markdown-wrapped and dash-opener variants", () => {
  expect(stripInlineSpeakerLabel("dum**JFC:**b", "JFC")).toBe("dumb");
  expect(stripInlineSpeakerLabel("a JFC:— b", "JFC")).toBe("a b");
});

test("stripInlineSpeakerLabel keeps a word separator on a space-delimited inline label", () => {
  expect(stripInlineSpeakerLabel("one JFC: two", "JFC")).toBe("one two");
});

// The finalized canon-purity guarantee: cleanPerSpeakerReply (the persist-path entry point) must never
// leave ANY self-tag fragment — leading, inline, or foreign-drift — in the stored body. This is the exact
// shape the corrupted fixture row should have persisted. RED on old code (mid-word fragment survived).
test("cleanPerSpeakerReply persists NO self-tag fragment — leading + inline + foreign all scrubbed", () => {
  const raw = "JFC: My whole religion fits on an index card: ship the dumJFC: —b version.\nMara: her line";
  expect(cleanPerSpeakerReply(raw, "JFC", ["Mara", "Niko"])).toBe("My whole religion fits on an index card: ship the dumb version.");
});
