import {
  cleanPerSpeakerReply,
  LEADING_SPEAKER_TAG,
  normalizeExampleStart,
  speakerTagsToPlain,
  stripLeadingSpeakerName,
  stripSelfSpeakerLabel,
  truncateAtForeignLabel,
} from "@orb/kit/speaker-label";
import { expect, test } from "vitest";

test("LEADING_SPEAKER_TAG matches a leading <speaker> open-tag case-insensitively", () => {
  expect(LEADING_SPEAKER_TAG.test("<speaker>hi")).toBe(true);
  expect(LEADING_SPEAKER_TAG.test("  <Speaker name='x'> hi")).toBe(true);
  expect(LEADING_SPEAKER_TAG.test("hi <speaker>")).toBe(false);
});

test("speakerTagsToPlain converts inline markers to `Name: ` attribution", () => {
  expect(speakerTagsToPlain("<speaker>Alice</speaker>Hello <speaker>Bob</speaker>Hi")).toBe(
    "Alice: Hello Bob: Hi",
  );
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
