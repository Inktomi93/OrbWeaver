import { REACTION_SEGMENT_SNIPPET_MAX } from "@orb/contracts/chat";
import type { SpeakerSpan } from "@orb/kit/speaker-label";
import { parseSpeakerSpans, resolveSegmentAnchor, segmentSnippet } from "@orb/kit/speaker-label";
import { expect, test } from "../../support/fixtures.ts";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// SEGMENT-ANCHORING FITNESS SUITE (interaction-direction-spec §9.2 unknown #2 / B7 "MR3's first task").
//
// The reactions build (B6/B7) wants to anchor a human/character reaction to ONE speaker's line inside a
// multi-speaker message — it stores a SEGMENT INDEX (the position of a `parseSpeakerSpans` span) so a
// reaction can say "I'm reacting to Bob's line, the 3rd span". The de-risk question this suite answers,
// BEFORE the merge-window schema build commits to storing indices:
//
//   Does `parseSpeakerSpans` produce, for a FIXED body, a deterministic, ordered, speaker-labelled
//   segmentation whose (index → speaker) mapping is STABLE enough that a stored index keeps pointing at
//   the same speaker's line across a re-parse and a slight edit?
//
// This is analysis expressed as executable pins. Each `test` block states the property AND, in the
// FITNESS/STABILITY groups, whether it is a green FIT signal or a documented FRAGILITY the reaction
// MODEL (not the parser) must handle. The prose verdict lives in the lane report; the pins are the
// evidence it rests on.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The ordered speaker labels of a segmentation — the "index → who" map a stored reaction anchor reads.
 *  `null` = a narration / plain span (it OCCUPIES an index too; the index space is not speaker-only). */
const speakers = (spans: readonly SpeakerSpan[]): readonly (string | null)[] => spans.map((s) => s.speaker);

const CHARACTERS = ["Alice", "Bob"];

// ══ GROUP 1 — THE VARIANT CORPUS ═══════════════════════════════════════════════════════════════════
// For each realistic multi-speaker shape: does it segment into isolable per-speaker lines at all?

test("variant: <speaker>-tagged multi-speaker — one span per marker, ordered", () => {
  const spans = parseSpeakerSpans("<speaker>Alice</speaker>Hi Bob.<speaker>Bob</speaker>Hey Alice.");
  expect(spans).toEqual([
    { speaker: "Alice", text: "Hi Bob." },
    { speaker: "Bob", text: "Hey Alice." },
  ]);
});

test("variant: tagged WITH a narration preamble — the preamble is span 0 (null), speakers shift to 1+", () => {
  const spans = parseSpeakerSpans("The tavern falls quiet.\n<speaker>Alice</speaker>Well.");
  expect(spans).toEqual([
    { speaker: null, text: "The tavern falls quiet.\n" },
    { speaker: "Alice", text: "Well." },
  ]);
  // The load-bearing anchoring fact: a reaction to Alice's line is index 1, NOT index 0 — narration
  // consumes an index slot ahead of her. B6/B7 anchors are positions in THIS array, narration included.
  expect(speakers(spans)).toEqual([null, "Alice"]);
});

test("variant: tagged with INTER-speaker narration — trailing narration folds into the PRECEDING speaker", () => {
  // Between Alice's tag and Bob's tag sits "The fire crackles." — the parser attributes it to ALICE
  // (her span runs to the next marker), it is NOT a separate narration span. A reaction to that
  // narration line therefore lands on Alice's index, and Bob is a single clean index after it.
  const spans = parseSpeakerSpans("<speaker>Alice</speaker>Hi.\nThe fire crackles.\n<speaker>Bob</speaker>Hey.");
  expect(spans).toEqual([
    { speaker: "Alice", text: "Hi.\nThe fire crackles.\n" },
    { speaker: "Bob", text: "Hey." },
  ]);
});

test("variant: MIXED tagged + plain `Name:` — ANY tag makes the marker grammar authoritative, plain labels do not split", () => {
  // characterNames are IGNORED the instant one real `<speaker>` tag exists. The plain "Bob:" line is folded
  // into Alice's span, NOT promoted to its own segment. A body is parsed by ONE grammar, never a blend.
  const spans = parseSpeakerSpans("<speaker>Alice</speaker>I saw him.\nBob: Did you.", CHARACTERS);
  expect(spans).toEqual([{ speaker: "Alice", text: "I saw him.\nBob: Did you." }]);
});

test("variant: TAGLESS name-labelled lines — each line-start character-name label opens a segment, label text KEPT", () => {
  const spans = parseSpeakerSpans("Alice: Ready?\nBob: Always.", CHARACTERS);
  expect(spans).toEqual([
    { speaker: "Alice", text: "Alice: Ready?\n" },
    { speaker: "Bob", text: "Bob: Always." },
  ]);
});

test("variant: quoted dialogue, NO tags, NO character-name match — a single null span (NO per-speaker anchor available)", () => {
  // Free narrator prose with quoted dialogue and no `<speaker>` tags / no line-start character label yields
  // ONE whole-message span. This is the honest floor: for this shape there is NO segment to anchor to —
  // B7's "whole-message default" is the only target. Not a bug: there is no reliable per-speaker signal.
  const content = '"Ready?" Alice asked. "Always," said Bob.';
  expect(parseSpeakerSpans(content, CHARACTERS)).toEqual([{ speaker: null, text: content }]);
});

test("variant: single-speaker (one tag) — one span, index 0", () => {
  expect(parseSpeakerSpans("<speaker>Alice</speaker>Solo line.")).toEqual([{ speaker: "Alice", text: "Solo line." }]);
});

test("variant: empty body — the no-op single null span (index 0 exists, text empty)", () => {
  expect(parseSpeakerSpans("")).toEqual([{ speaker: null, text: "" }]);
});

test("variant: a character name MID-LINE never splits — the label must open a line (no phantom segment)", () => {
  const content = "Alice turned to Bob: the door was open.";
  expect(parseSpeakerSpans(content, CHARACTERS)).toEqual([{ speaker: null, text: content }]);
});

test("variant: MALFORMED / unterminated tag — left as plain text, no crash, no phantom segment", () => {
  // An open tag with no close never matches SPEAKER_TAG_PAIR; the body degrades to the plain path
  // (here no character names) and stays one null span. A torn tag cannot fabricate or drop a segment.
  const content = "<speaker>Alice half a tag and then just prose";
  expect(parseSpeakerSpans(content)).toEqual([{ speaker: null, text: content }]);
});

test("variant: consecutive SAME-speaker tags — two DISTINCT line segments (line-level, not grouped-per-speaker)", () => {
  // Two Alice tags → two Alice spans. This is CORRECT for line anchoring (B7 targets "one speaker's
  // LINE", not "all of Alice"): each line is its own index. The word "group" in the spec means
  // ordered isolation, not coalescing a speaker's lines into one.
  const spans = parseSpeakerSpans("<speaker>Alice</speaker>First.<speaker>Alice</speaker>Second.");
  expect(spans).toEqual([
    { speaker: "Alice", text: "First." },
    { speaker: "Alice", text: "Second." },
  ]);
});

test("variant: a character-name label inside a fenced code block does NOT split (segment count unaffected by code)", () => {
  const content = "Alice: look.\n\n```py\nBob: not_a_speaker = 1\n```";
  expect(parseSpeakerSpans(content, CHARACTERS)).toEqual([{ speaker: "Alice", text: content }]);
});

// ══ GROUP 2 — RE-PARSE DETERMINISM (the cheapest stability floor) ══════════════════════════════════
// A stored index is meaningless if two parses of the SAME bytes disagree. They must not.

const CORPUS: readonly { readonly name: string; readonly content: string; readonly characterNames: readonly string[] }[] = [
  { name: "tagged-multi", content: "<speaker>Alice</speaker>Hi.<speaker>Bob</speaker>Yo.", characterNames: [] },
  { name: "tagged-preamble", content: "Quiet.\n<speaker>Alice</speaker>Hi.", characterNames: [] },
  { name: "tagged-interleave", content: "<speaker>Alice</speaker>a\nnarr\n<speaker>Bob</speaker>b", characterNames: [] },
  { name: "plain-characters", content: "Alice: one\nBob: two\nAlice: three", characterNames: CHARACTERS },
  { name: "quoted-untagged", content: '"Hi" said Alice. "Bye" said Bob.', characterNames: CHARACTERS },
  { name: "empty", content: "", characterNames: [] },
  { name: "single", content: "<speaker>Alice</speaker>solo", characterNames: [] },
  { name: "fenced", content: "Alice: x\n```\nBob: y\n```", characterNames: CHARACTERS },
];

test("stability: re-parsing identical bytes is byte-for-byte identical (deterministic — pure)", () => {
  for (const { content, characterNames } of CORPUS) {
    expect(parseSpeakerSpans(content, characterNames)).toEqual(parseSpeakerSpans(content, characterNames));
  }
});

test("stability: passing the character names in a different ORDER does not change the segmentation (order-independent)", () => {
  const forward = parseSpeakerSpans("Alice: one\nBob: two", ["Alice", "Bob"]);
  const reversed = parseSpeakerSpans("Alice: one\nBob: two", ["Bob", "Alice"]);
  expect(forward).toEqual(reversed);
});

// ══ GROUP 3 — EDIT STABILITY (the property that actually decides FIT) ══════════════════════════════
// A reaction outlives an edit to its message. Does the stored index keep meaning the same speaker?

test("stability FIT: a WITHIN-SPAN text edit (tagged) preserves the index → speaker map for every other span", () => {
  // Edit ONLY Alice's spoken text; add/remove NO markers. Bob's index and speaker are untouched. This is
  // the good case: for the tagged grammar, ordinary content edits do not perturb sibling anchors.
  const before = parseSpeakerSpans("<speaker>Alice</speaker>Hi.<speaker>Bob</speaker>Bye.");
  const after = parseSpeakerSpans("<speaker>Alice</speaker>Hello everyone, good to see you.<speaker>Bob</speaker>Bye.");
  expect(speakers(before)).toEqual(speakers(after));
  expect(after[1]).toEqual({ speaker: "Bob", text: "Bye." }); // index 1 still Bob, byte-identical
});

test("stability FRAGILITY: a STRUCTURAL edit (insert a marker) SHIFTS every later index — anchor by raw index breaks", () => {
  // Insert a new speaker BEFORE Bob. Bob was index 1; now he is index 2. A reaction storing the bare
  // integer 1 now points at the inserted speaker. INDEX ALONE IS NOT EDIT-STABLE. (True of any parser —
  // it is a property of integer anchoring, and the reaction model must answer for it, not the parser.)
  const before = parseSpeakerSpans("<speaker>Alice</speaker>Hi.<speaker>Bob</speaker>Bye.");
  const after = parseSpeakerSpans("<speaker>Alice</speaker>Hi.<speaker>Cara</speaker>Wait.<speaker>Bob</speaker>Bye.");
  expect(before[1]?.speaker).toBe("Bob");
  expect(after[1]?.speaker).toBe("Cara"); // the index moved to a different speaker
  expect(after[2]?.speaker).toBe("Bob");
});

test("stability MITIGATION: co-storing the SPEAKER NAME lets a re-parse DETECT the shift (index 1 is no longer Bob)", () => {
  // The parser gives every span a `.speaker`, so a reaction stored as (index, speakerName) is
  // self-validating: on re-parse, if spans[index].speaker !== storedName the anchor is known-stale and
  // B7 can fall back to whole-message. This is why the `.speaker` field is load-bearing for B6/B7.
  const storedIndex = 1;
  const storedSpeaker = "Bob";
  const reparsed = parseSpeakerSpans("<speaker>Alice</speaker>Hi.<speaker>Cara</speaker>Wait.<speaker>Bob</speaker>Bye.");
  expect(reparsed[storedIndex]?.speaker).not.toBe(storedSpeaker); // detected: the anchor is stale
  const revalidated = reparsed.findIndex((s) => s.speaker === storedSpeaker);
  expect(revalidated).toBe(2); // and the same-name span is re-findable when the speaker is unique
});

test("stability HOLE: a SAME-SPEAKER structural insert defeats even (index, speaker) validation", () => {
  // The mitigation above has a floor. Insert ANOTHER Bob line before the target Bob line. index 1 is
  // STILL a "Bob" span, so speaker-name validation PASSES — yet it points at the WRONG Bob line. Neither
  // the bare index nor (index, speaker) survives a same-speaker insert; only a span-text fingerprint /
  // whole-message-on-edit invalidation does. This is the sharpest finding MR3 must design around.
  const before = parseSpeakerSpans("<speaker>Bob</speaker>the original line");
  const after = parseSpeakerSpans("<speaker>Bob</speaker>an inserted line<speaker>Bob</speaker>the original line");
  expect(before[0]).toEqual({ speaker: "Bob", text: "the original line" });
  // (index 0, "Bob") still validates on the edited body, but now names the INSERTED line:
  expect(after[0]?.speaker).toBe("Bob");
  expect(after[0]?.text).toBe("an inserted line");
  expect(after[0]?.text).not.toBe(before[0]?.text); // same anchor, different line — silent mis-target
});

test("stability FRAGILITY (plain path): editing NARRATION to contain a line-start character-name label spawns a new segment", () => {
  // The tagless character-label grammar is more fragile than the tagged one: a pure text edit that happens to
  // start a line with a character name creates a split that did not exist. Reactions on a character-labelled
  // (untagged) body are more edit-sensitive than on a tagged body — MR3 should note the two grammars
  // have DIFFERENT edit-stability, and prefer the tagged form as the anchoring substrate where present.
  const before = parseSpeakerSpans("A quiet room.\nBob: hello.", CHARACTERS);
  const after = parseSpeakerSpans("A quiet room.\nAlice: who's there?\nBob: hello.", CHARACTERS);
  expect(before.length).toBe(2); // [narration, Bob]
  expect(after.length).toBe(3); // [narration, Alice, Bob] — Bob shifted from index 1 to index 2
  expect(before[1]?.speaker).toBe("Bob");
  expect(after[1]?.speaker).toBe("Alice");
});

// ══ GROUP 3b — THE #1354 GRAMMAR CHANGE, ANCHORED (#1388) ══════════════════════════════════════════
// The fragilities above were findings about the BARE index; the reaction model answered them with a
// fingerprint — `SegmentAnchor.snippet` + `resolveSegmentAnchor`, which validates index AND speaker AND the
// snippet PREFIX and returns `null` (the caller degrades to whole-message) on any mismatch. #1388 asks
// whether #1354's line-anchored `insideCodeFence` can slip past that: an INLINE (non-line-anchored) triple
// backtick used to flip the fence state and suppress EVERY later label, so a body whose labels were
// suppressed before now splits, and every stored index in it means something else.
//
// It cannot slip past. The shift is DETECTED, and these two pins are the receipt — the first that a
// pre-#1354 anchor over exactly that shape degrades, the second (the planted control) that anchors over the
// same body still resolve when they genuinely match, so the first is not passing vacuously.

/** The #1354 shape: an inline triple backtick (mid-line, so NOT a fence) followed by line-start labels. */
const INLINE_FENCE_BODY = "Narr ``` inline\nAlice: one\nBob: two";

test("#1388 a PRE-#1354 anchor over an inline-backtick body DEGRADES — the snippet fingerprint detects the shift", () => {
  // Under the OLD occurrence-counting grammar the inline ``` flipped the state, so both later labels were
  // suppressed and the whole body was ONE null span. A reaction captured then stored (0, null, <head of the
  // whole body>) — that is the anchor being re-resolved here.
  const preChange = { index: 0, speaker: null, snippet: segmentSnippet(INLINE_FENCE_BODY, REACTION_SEGMENT_SNIPPET_MAX) };

  // Today the body splits into three spans, so index 0 names only the narration line.
  expect(speakers(parseSpeakerSpans(INLINE_FENCE_BODY, CHARACTERS))).toEqual([null, "Alice", "Bob"]);

  // Index 0 still EXISTS and its speaker still matches (`null`), so index+speaker validation alone would
  // have accepted it and silently re-targeted a reaction at a narration fragment. The snippet is what
  // refuses: the stored head carries Alice's and Bob's lines, which span 0 no longer begins with.
  expect(resolveSegmentAnchor(INLINE_FENCE_BODY, CHARACTERS, preChange)).toBeNull();
});

test("#1388 …PLANTED CONTROL: an anchor minted from the CURRENT parse of the SAME body still resolves", () => {
  // Without this, the pin above would pass just as well against a `resolveSegmentAnchor` that rejected
  // everything. Same body, same characters — an anchor captured NOW resolves to the line it named.
  const spans = parseSpeakerSpans(INLINE_FENCE_BODY, CHARACTERS);
  const bob = spans[2];
  expect(bob?.speaker).toBe("Bob");
  const current = { index: 2, speaker: "Bob", snippet: segmentSnippet(bob?.text ?? "", REACTION_SEGMENT_SNIPPET_MAX) };

  expect(resolveSegmentAnchor(INLINE_FENCE_BODY, CHARACTERS, current)?.text).toBe(bob?.text);
});

// ══ GROUP 4 — INDEX-SPACE INVARIANTS the reaction schema can rely on ═══════════════════════════════

test("invariant: every body yields at least ONE span (index 0 always exists — a reaction always has a target)", () => {
  for (const { content, characterNames } of CORPUS) {
    expect(parseSpeakerSpans(content, characterNames).length).toBeGreaterThanOrEqual(1);
  }
});

test("invariant: spans are CONTIGUOUS and TOTAL — concatenating every span's text reconstructs the tagless body", () => {
  // For the PLAIN/tagless path the label text stays in-span, so the spans tile the original bytes exactly.
  // (The tagged path deliberately CONSUMES the markers, so it does NOT round-trip — that is by design and
  // is asserted separately below.) A total tiling means an index maps to a real, gap-free slice.
  const content = "Narration.\nAlice: hi\nBob: yo\nAlice: bye";
  const spans = parseSpeakerSpans(content, CHARACTERS);
  expect(spans.map((s) => s.text).join("")).toBe(content);
});

test("invariant: the tagged path CONSUMES markers (round-trip is lossy BY DESIGN — the tag is invisible markup)", () => {
  const content = "<speaker>Alice</speaker>hi<speaker>Bob</speaker>yo";
  const joined = parseSpeakerSpans(content)
    .map((s) => s.text)
    .join("");
  expect(joined).toBe("hiyo"); // markers gone — anchoring must key on span identity, never byte offsets
});
