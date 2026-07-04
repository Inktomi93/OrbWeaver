// Unit: the `<speaker>NAME</speaker>` split (features/chat/lib/parse-speaker-spans, #21 §12.4). Pins
// the load-bearing byte-identical no-op (zero markers => one null-speaker span carrying `content`
// untouched) plus the ordered multi-span shape a tagged/merged-narrator body produces.

import { parseSpeakerSpans } from "../../../../../packages/client/src/features/chat/lib/parse-speaker-spans";
import { expect, test } from "../../../../support/fixtures";

test("zero markers is the byte-identical no-op: one null-speaker span, text untouched", () => {
  const content = "Just plain **markdown** with no speaker tags.";
  expect(parseSpeakerSpans(content)).toEqual([{ speaker: null, text: content }]);
});

test("empty content is also the no-op shape", () => {
  expect(parseSpeakerSpans("")).toEqual([{ speaker: null, text: "" }]);
});

test("a single marker attributes everything after it to that speaker", () => {
  expect(parseSpeakerSpans("<speaker>Alice</speaker>Hello there!")).toEqual([
    { speaker: "Alice", text: "Hello there!" },
  ]);
});

test("text before the first marker is a preceding null-speaker span (narrator preamble)", () => {
  expect(parseSpeakerSpans("The room falls silent.<speaker>Bob</speaker>Well then.")).toEqual([
    { speaker: null, text: "The room falls silent." },
    { speaker: "Bob", text: "Well then." },
  ]);
});

test("multiple markers split into ordered per-speaker spans", () => {
  const content = "<speaker>Alice</speaker>Hi!<speaker>Bob</speaker>Hey Alice.";
  expect(parseSpeakerSpans(content)).toEqual([
    { speaker: "Alice", text: "Hi!" },
    { speaker: "Bob", text: "Hey Alice." },
  ]);
});

test("attrs on the open tag are tolerated (kit's shape allows them)", () => {
  expect(parseSpeakerSpans('<speaker data-x="1">Alice</speaker>Hi!')).toEqual([
    { speaker: "Alice", text: "Hi!" },
  ]);
});

test("an empty/blank speaker name normalizes to a null-speaker span", () => {
  expect(parseSpeakerSpans("<speaker>   </speaker>Narration text.")).toEqual([
    { speaker: null, text: "Narration text." },
  ]);
});

test("a trailing marker with no following text yields an empty text span (no crash)", () => {
  expect(parseSpeakerSpans("<speaker>Alice</speaker>")).toEqual([{ speaker: "Alice", text: "" }]);
});
