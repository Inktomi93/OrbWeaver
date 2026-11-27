// Entry: `stampWhen`, `createdStamp` and `wasEditedAfterCreate`, the one time rule every lead-word stamp and labeled row shares.
// Layer: client lib (node, dom). Red: a fresh stamp reading the bare Intl word "now" after its lead ("created now"), and an edit
// shown for an entity whose two stamps are one write batch apart.
import { createdStamp, stampWhen, wasEditedAfterCreate } from "@orb/client/lib";
import { createTimeLib, MS_PER_HOUR, MS_PER_MINUTE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { FRESH_STAMP_WORD } from "#client/lib/stamp-copy.ts";

const NOW = 1_750_000_000_000;
const time = createTimeLib({ now: () => NOW, locale: "en-US", timeZone: "UTC" });

test("an instant under a minute old, or ahead of the clock, reads the fresh word, never the bare Intl `now`", () => {
  expect(time.formatRelative(NOW)).not.toBe(FRESH_STAMP_WORD);
  for (const epochMs of [NOW, NOW - MS_PER_MINUTE + 1, NOW + MS_PER_MINUTE]) {
    expect(stampWhen(time, epochMs)).toBe(FRESH_STAMP_WORD);
  }
  expect(createdStamp(time, NOW)).toMatch(new RegExp(`${FRESH_STAMP_WORD}$`, "u"));
});

test("an older instant reads through the relative form, so a stamp and a labeled row can never disagree", () => {
  for (const epochMs of [NOW - MS_PER_MINUTE, NOW - MS_PER_HOUR, NOW - 30 * MS_PER_HOUR * 24]) {
    expect(stampWhen(time, epochMs)).toBe(time.formatRelative(epochMs));
  }
});

test("an entity counts as edited only when its update stamp is past the write batch of its creation", () => {
  expect(wasEditedAfterCreate(NOW, NOW)).toBe(false);
  expect(wasEditedAfterCreate(NOW, NOW + MS_PER_MINUTE)).toBe(false);
  expect(wasEditedAfterCreate(NOW, NOW + MS_PER_MINUTE + 1)).toBe(true);
});
