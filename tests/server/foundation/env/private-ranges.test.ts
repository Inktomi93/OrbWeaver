// foundation/env/private-ranges — the one TRUSTED_PRIVATE_RANGES parse. Pins: the list split the egress guard and the
// boot refusal share, and which entries the refusal picks out (the boot-level refusal is pinned in index.test.ts).

import { describe } from "vitest";
import {
  parseTrustedPrivateRanges,
  trustedPrivateRangeRefusal,
  unreadableTrustedPrivateRanges,
} from "../../../../packages/server/src/foundation/env/private-ranges.ts";
import { expect, test } from "../../../support/fixtures.ts";

describe("parseTrustedPrivateRanges", () => {
  test("unset and blank values are no entries", () => {
    expect(parseTrustedPrivateRanges(undefined)).toEqual([]);
    expect(parseTrustedPrivateRanges(" , ,")).toEqual([]);
  });

  test("entries are trimmed and empty list items dropped, in order", () => {
    expect(parseTrustedPrivateRanges(" 10.0.0.0/8, ,fd00::/8 ,192.168.7.5")).toEqual(["10.0.0.0/8", "fd00::/8", "192.168.7.5"]);
  });
});

describe("unreadableTrustedPrivateRanges", () => {
  test("picks out exactly the entries the range match cannot read, keeping the readable ones out", () => {
    expect(unreadableTrustedPrivateRanges("10.0.0.0/8, 10.0.0.0/33, fd00::/8, lan, 192.168.1.0/, 192.168.7.5")).toEqual(["10.0.0.0/33", "lan", "192.168.1.0/"]);
  });

  test("a list of readable ranges refuses nothing", () => {
    expect(unreadableTrustedPrivateRanges("10.0.0.0/8, fd00::/8, 0.0.0.0/0, ::1")).toEqual([]);
  });

  test("the refusal names its env key and the entry, so the operator can find the line", () => {
    const refusal = trustedPrivateRangeRefusal("10.0.0.0/33");
    expect(refusal.key).toBe("TRUSTED_PRIVATE_RANGES");
    expect(refusal.message).toContain('"10.0.0.0/33"');
  });
});
