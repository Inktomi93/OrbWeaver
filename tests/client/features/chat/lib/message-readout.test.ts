// Unit: the metadata row's #1032 cache economics readout (features/chat/lib/message-readout).
//
// The outcome notice (`messageOutcomeNotice`) was KILLED (#1876, owner ruling) — its tests are deleted
// with it. What remains: the per-turn CACHE economics derivation.

import { cacheTokensLabel } from "../../../../../packages/client/src/features/chat/lib/message-readout.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("cache economics render only the side the backend actually reported", () => {
  expect(cacheTokensLabel(1024, 512)).toBe("cache 1024 read / 512 written");
  expect(cacheTokensLabel(1024, null)).toBe("cache 1024 read");
  expect(cacheTokensLabel(null, 512)).toBe("cache 512 written");
});

// A zero is "this turn used no cache", which is the same statement as absence — printing "cache 0 read"
// would spend a datum on nothing.
test("no cache activity is no datum — nulls and zeroes alike", () => {
  expect(cacheTokensLabel(null, null)).toBeNull();
  expect(cacheTokensLabel(0, 0)).toBeNull();
  expect(cacheTokensLabel(0, null)).toBeNull();
});
